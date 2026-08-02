"use server";

import { revalidatePath } from "next/cache";
import { UserRole, ContractStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  canManageContractApproval,
  canEditContract,
  canHandleRejectedContract,
  canRecordContractPayment,
  isSignedContractStatus,
} from "@/lib/contracts/access";
import { isPendingContractApproval } from "@/lib/contracts/approval";
import { sumPaymentRecords, validateContractPaymentAmount } from "@/lib/contracts/payment-waterfall";
import { finalizeSignedContract } from "@/lib/contracts/finalize";
import { revalidateApprovalSurfaces } from "@/lib/approvals/revalidate";
import {
  contractFormSchema,
  contractPaymentRecordSchema,
  contractInvoiceRecordSchema,
  contractRejectSchema,
} from "@/lib/validations/contract";
import {
  canManageOpportunityOwner,
  getContractForUser,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { canSignOpportunity } from "@/lib/opportunities/status";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { assertSelectableSalesOwner } from "@/lib/sales/selectable-users";
import { replaceContractProducts } from "@/lib/contracts/replace-products";
import {
  contractProductsChanged,
  paymentInstallmentsChanged,
} from "@/lib/contracts/edit-diff";
import {
  readPartiesFromFormData,
  replaceContractParties,
} from "@/lib/deals/party-sync";
import {
  externalCostInstallmentsUpdateSchema,
  externalCostPayoutRecordSchema,
} from "@/lib/validations/contract";

function parseOwnerField(raw: FormDataEntryValue | null): string | null {
  const value = raw?.toString().trim() ?? "";
  if (!value || value === POOL_OWNER_VALUE) return null;
  return value;
}

async function resolveOwnerId(role: UserRole, userId: string, ownerId: string | null | undefined) {
  if (role === "SALES") return userId;
  if (canManageOpportunityOwner(role) && ownerId) {
    await assertSelectableSalesOwner(role, userId, ownerId);
    return ownerId;
  }
  return userId;
}

function formatActionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "表单校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败，请重试" };
}

function parseJsonField<T>(raw: FormDataEntryValue | null, field: string): T {
  const text = raw?.toString().trim() ?? "";
  if (!text) throw new Error(`${field} 数据缺失`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${field} 格式无效`);
  }
}

function parseContractForm(formData: FormData) {
  const products = parseJsonField(formData.get("productsJson"), "产品");
  const installments = parseJsonField(formData.get("installmentsJson"), "回款计划");

  return contractFormSchema.parse({
    title: formData.get("title"),
    totalAmount: formData.get("totalAmount"),
    signingType: formData.get("signingType"),
    signCustomerId: formData.get("signCustomerId"),
    endUserCustomerId: formData.get("endUserCustomerId"),
    signContactId: formData.get("signContactId"),
    ourRepresentativeId: formData.get("ourRepresentativeId"),
    paymentMethod: formData.get("paymentMethod") || null,
    ownerId: parseOwnerField(formData.get("ownerId")),
    opportunityId: formData.get("opportunityId") || null,
    signedAt: formData.get("signedAt") || null,
    effectiveAt: formData.get("effectiveAt") || null,
    expiresAt: formData.get("expiresAt") || null,
    notes: formData.get("notes") || undefined,
    products,
    installments,
  });
}

async function validateSignContact(signCustomerId: string, signContactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: signContactId, customerId: signCustomerId },
  });
  if (!contact) throw new Error("对方代表须为签约客户的联系人");
}

async function createContractCore(
  session: { user: { id: string; role: UserRole } },
  parsed: ReturnType<typeof contractFormSchema.parse>,
  options?: {
    contractId?: string;
    parties?: Array<{ customerId: string; role: import("@prisma/client").DealPartyRole; note?: string | null }>;
  }
): Promise<ActionResult & { contractId?: string }> {
  const contractId = options?.contractId;
  const parties = options?.parties ?? [];
  const ownerId = await resolveOwnerId(session.user.role, session.user.id, parsed.ownerId);
  await validateSignContact(parsed.signCustomerId, parsed.signContactId);

  if (parsed.opportunityId) {
    const opportunity = await getOpportunityForUser(
      parsed.opportunityId,
      session.user.role,
      session.user.id
    );
    if (!opportunity) return { error: "关联商机不存在或无权访问" };
    if (!canSignOpportunity(opportunity.status)) {
      return { error: "该商机状态不允许签订销售合同" };
    }
  }

  const signedAt = new Date(parsed.signedAt);
  const needsApproval = session.user.role === "SALES";
  const status: ContractStatus = needsApproval ? "PENDING_APPROVAL" : "SIGNED_PENDING_IMPL";

  const contract = await prisma.$transaction(async (tx) => {
    const data = {
      title: parsed.title.trim(),
      totalAmount: parsed.totalAmount,
      signingType: parsed.signingType,
      status,
      signCustomerId: parsed.signCustomerId,
      endUserCustomerId: parsed.endUserCustomerId,
      signContactId: parsed.signContactId,
      ourRepresentativeId: parsed.ourRepresentativeId,
      paymentMethod: parsed.paymentMethod?.trim() || undefined,
      ownerId,
      opportunityId: parsed.opportunityId ?? undefined,
      signedAt,
      effectiveAt: parsed.effectiveAt ? new Date(parsed.effectiveAt) : undefined,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
      notes: parsed.notes?.trim() || undefined,
      submittedAt: new Date(),
      submittedById: session.user.id,
      rejectedAt: null,
      rejectReason: null,
    };

    const created = contractId
      ? await tx.contract.update({ where: { id: contractId }, data })
      : await tx.contract.create({ data });

    if (contractId) {
      const payoutCount = await tx.externalCostPayoutRecord.count({
        where: { contractId },
      });
      if (payoutCount > 0) {
        throw new Error(
          "该合同已有外部成本实付记录，请先到「外部成本」页删除实付后再改产品，或单独维护付款计划"
        );
      }
      await tx.contractProduct.deleteMany({ where: { contractId } });
      await tx.paymentInstallment.deleteMany({ where: { contractId } });
    }

    await replaceContractProducts(tx, created.id, parsed.products);

    await tx.paymentInstallment.createMany({
      data: parsed.installments.map((row) => ({
        contractId: created.id,
        periodNumber: row.periodNumber,
        amount: row.amount,
        condition: row.condition?.trim() || undefined,
        dueAt: row.dueAt ? new Date(row.dueAt) : undefined,
      })),
    });

    await replaceContractParties(tx, created.id, parties, [
      parsed.signCustomerId,
      parsed.endUserCustomerId,
    ]);

    if (!needsApproval) {
      await finalizeSignedContract(tx, {
        contractId: created.id,
        signedAt,
        approverId: session.user.id,
      });
    }

    return created;
  });

  revalidatePath("/contracts");
  revalidateApprovalSurfaces();
  revalidatePath("/opportunities");
  revalidatePath("/projects");

  const { recordEntityOperation, ENTITY_TYPES } = await import(
    "@/lib/audit/entity-operation-log"
  );
  await recordEntityOperation({
    entityType: ENTITY_TYPES.CONTRACT,
    entityId: contract.id,
    userId: session.user.id,
    action: contractId ? "重新提交" : "创建",
    summary: contractId
      ? `重新提交合同「${contract.title}」`
      : `创建合同「${contract.title}」`,
  });

  return {
    redirectTo: `/contracts/${contract.id}`,
    contractId: contract.id,
  };
}

export async function createContract(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
    if (!canEditContract(session.user.role)) {
      return { error: "无权新建合同，请联系销售管理或管理员" };
    }
    const parsed = parseContractForm(formData);
    const parties = readPartiesFromFormData(formData);
    return await createContractCore(session, parsed, { parties });
  } catch (error) {
    return formatActionError(error);
  }
}

export async function createContractFromOpportunity(
  opportunityId: string,
  formData: FormData
): Promise<ActionResult> {
  formData.set("opportunityId", opportunityId);
  return createContract(formData);
}

export async function resubmitContract(contractId: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const contract = await getContractForUser(contractId, session.user.role, session.user.id);
    if (!contract) return { error: "合同不存在或无权访问" };
    if (
      !canHandleRejectedContract(session.user.role, session.user.id, {
        ownerId: contract.ownerId,
        submittedById: contract.submittedById,
        status: contract.status,
      })
    ) {
      return { error: "无权重新提交该合同" };
    }

    const parsed = parseContractForm(formData);
    const parties = readPartiesFromFormData(formData);
    const result = await createContractCore(session, parsed, { contractId, parties });
    if (!result.error) {
      revalidatePath("/notifications");
    }
    return result;
  } catch (error) {
    return formatActionError(error);
  }
}

/** 删除已驳回合同（发起人或销管） */
export async function deleteRejectedContract(contractId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        project: { select: { id: true } },
        paymentRecords: { select: { id: true } },
        attachments: { select: { storageKey: true } },
        invoiceRecords: {
          select: { attachments: { select: { storageKey: true } } },
        },
      },
    });
    if (!contract) return { error: "合同不存在" };
    if (
      !canHandleRejectedContract(session.user.role, session.user.id, {
        ownerId: contract.ownerId,
        submittedById: contract.submittedById,
        status: contract.status,
      })
    ) {
      return { error: "仅已驳回合同可由发起人删除" };
    }
    if (contract.project) return { error: "合同已关联项目，无法删除" };
    if (contract.paymentRecords.length > 0) return { error: "合同已有回款记录，无法删除" };

    const { deleteContractAttachmentFile } = await import("@/lib/contracts/attachments");
    for (const att of contract.attachments) {
      await deleteContractAttachmentFile(att.storageKey).catch(() => undefined);
    }
    for (const inv of contract.invoiceRecords) {
      for (const att of inv.attachments) {
        await deleteContractAttachmentFile(att.storageKey).catch(() => undefined);
      }
    }

    await prisma.contract.delete({ where: { id: contractId } });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: contractId,
      userId: session.user.id,
      action: "删除",
      summary: `删除已驳回合同「${contract.title}」`,
    });

    revalidatePath("/contracts");
    revalidateApprovalSurfaces();
    revalidatePath("/notifications");
    revalidatePath("/opportunities");

    return { redirectTo: "/contracts" };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function updateContract(contractId: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
    if (!canEditContract(session.user.role)) {
      return { error: "无权编辑合同" };
    }

    const existing = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        paymentRecords: { select: { amount: true } },
        project: { select: { id: true } },
        installments: {
          select: {
            periodNumber: true,
            amount: true,
            condition: true,
            dueAt: true,
          },
          orderBy: { periodNumber: "asc" },
        },
        products: {
          select: {
            productName: true,
            description: true,
            costType: true,
            costAmount: true,
            productServiceId: true,
            externalInstallments: {
              select: {
                periodNumber: true,
                amount: true,
                condition: true,
                dueAt: true,
              },
              orderBy: { periodNumber: "asc" },
            },
          },
        },
      },
    });
    if (!existing) return { error: "合同不存在" };

    const parsed = parseContractForm(formData);
    const parties = readPartiesFromFormData(formData);
    await validateSignContact(parsed.signCustomerId, parsed.signContactId);

    if (parsed.opportunityId) {
      const opportunity = await getOpportunityForUser(
        parsed.opportunityId,
        session.user.role,
        session.user.id
      );
      if (!opportunity) return { error: "关联商机不存在或无权访问" };
    }

    const ownerId =
      canManageOpportunityOwner(session.user.role) && parsed.ownerId
        ? parsed.ownerId
        : existing.ownerId;

    const signedAt = new Date(parsed.signedAt);
    if (isSignedContractStatus(existing.status)) {
      const totalPaid = sumPaymentRecords(existing.paymentRecords);
      if (parsed.totalAmount + 0.01 < totalPaid) {
        return { error: `合同金额不能低于已回款 ${totalPaid.toFixed(2)} 元` };
      }
    }

    const productsChanged = contractProductsChanged(
      existing.products.map((row) => ({
        productName: row.productName,
        description: row.description,
        costType: row.costType,
        costAmount: Number(row.costAmount),
        productServiceId: row.productServiceId,
        externalInstallments: row.externalInstallments.map((item) => ({
          periodNumber: item.periodNumber,
          amount: Number(item.amount),
          condition: item.condition,
          dueAt: item.dueAt,
        })),
      })),
      parsed.products
    );
    const installmentsChanged = paymentInstallmentsChanged(
      existing.installments.map((row) => ({
        periodNumber: row.periodNumber,
        amount: Number(row.amount),
        condition: row.condition,
        dueAt: row.dueAt,
      })),
      parsed.installments
    );

    if (productsChanged) {
      const payoutCount = await prisma.externalCostPayoutRecord.count({
        where: { contractId },
      });
      if (payoutCount > 0) {
        return {
          error:
            "该合同已有外部成本实付记录，请先到「外部成本」页删除实付后再改产品，或单独维护付款计划",
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          title: parsed.title.trim(),
          totalAmount: parsed.totalAmount,
          signingType: parsed.signingType,
          signCustomerId: parsed.signCustomerId,
          endUserCustomerId: parsed.endUserCustomerId,
          signContactId: parsed.signContactId,
          ourRepresentativeId: parsed.ourRepresentativeId,
          paymentMethod: parsed.paymentMethod?.trim() || null,
          ownerId,
          opportunityId: parsed.opportunityId ?? null,
          signedAt,
          effectiveAt: parsed.effectiveAt ? new Date(parsed.effectiveAt) : null,
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
          notes: parsed.notes?.trim() || null,
        },
      });

      if (productsChanged) {
        await replaceContractProducts(tx, contractId, parsed.products);
      }

      if (installmentsChanged) {
        await tx.paymentInstallment.deleteMany({ where: { contractId } });
        await tx.paymentInstallment.createMany({
          data: parsed.installments.map((row) => ({
            contractId,
            periodNumber: row.periodNumber,
            amount: row.amount,
            condition: row.condition?.trim() || undefined,
            dueAt: row.dueAt ? new Date(row.dueAt) : undefined,
          })),
        });
      }

      await replaceContractParties(tx, contractId, parties, [
        parsed.signCustomerId,
        parsed.endUserCustomerId,
      ]);

      if (existing.project) {
        await tx.project.update({
          where: { id: existing.project.id },
          data: {
            name: parsed.title.trim(),
            customerId: parsed.endUserCustomerId,
          },
        });
      }
    });

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/plans-tasks");
    revalidatePath("/today-work");

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: contractId,
      userId: session.user.id,
      action: "更新",
      summary: `更新合同「${parsed.title.trim()}」`,
    });

    return { redirectTo: `/contracts/${contractId}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function approveContract(contractId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
    if (!canManageContractApproval(session.user.role)) {
      return { error: "无权审核合同" };
    }

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract || !isPendingContractApproval(contract.status)) {
      return { error: "合同不存在或不在待审核状态" };
    }
    if (!contract.signedAt) {
      return { error: "合同缺少签约日期" };
    }

    const signedAt = contract.signedAt;

    await prisma.$transaction(async (tx) => {
      if (!contract.submittedAt || !contract.submittedById) {
        await tx.contract.update({
          where: { id: contractId },
          data: {
            submittedAt: contract.submittedAt ?? contract.createdAt,
            submittedById: contract.submittedById ?? contract.ownerId,
          },
        });
      }

      await finalizeSignedContract(tx, {
        contractId,
        signedAt,
        approverId: session.user.id,
      });
    });

    revalidatePath("/contracts");
    revalidateApprovalSurfaces();
    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/opportunities");
    revalidatePath("/projects");

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: contractId,
      userId: session.user.id,
      action: "审核通过",
      summary: `审核通过合同「${contract.title}」`,
    });

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function rejectContract(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
    const parsed = contractRejectSchema.parse({
      contractId: formData.get("contractId"),
      rejectReason: formData.get("rejectReason"),
    });

    const contract = await prisma.contract.findUnique({ where: { id: parsed.contractId } });
    if (!contract || !isPendingContractApproval(contract.status)) {
      return { error: "合同不存在或不在待审核状态" };
    }

    await prisma.contract.update({
      where: { id: parsed.contractId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectReason: parsed.rejectReason.trim(),
        approvedAt: null,
        approvedById: null,
      },
    });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: parsed.contractId,
      userId: session.user.id,
      action: "驳回",
      summary: `驳回合同「${contract.title}」`,
      detail: parsed.rejectReason.trim(),
    });

    const initiatorId = contract.submittedById || contract.ownerId;
    if (initiatorId) {
      const { createAppNotification, NOTIFICATION_TYPES } = await import(
        "@/lib/notifications/app-notifications"
      );
      await createAppNotification({
        type: NOTIFICATION_TYPES.CONTRACT_REJECTED,
        title: `合同已驳回：${contract.title}`,
        body: `驳回原因：${parsed.rejectReason.trim()}\n可删除该合同，或修改后重新申请。`,
        linkHref: `/contracts/${parsed.contractId}?edit=1`,
        meta: { contractId: parsed.contractId },
        recipientUserIds: [initiatorId],
        excludeUserId: session.user.id,
      });
    }

    revalidatePath("/contracts");
    revalidateApprovalSurfaces();
    revalidatePath(`/contracts/${parsed.contractId}`);
    revalidatePath("/notifications");

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function addContractPaymentRecord(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    if (!canRecordContractPayment(session.user.role)) {
      return { error: "无权登记回款" };
    }

    const parsed = contractPaymentRecordSchema.parse({
      contractId: formData.get("contractId"),
      amount: formData.get("amount"),
      paidAt: formData.get("paidAt"),
      notes: formData.get("notes") || undefined,
    });

    const contract = await getContractForUser(
      parsed.contractId,
      session.user.role,
      session.user.id
    );
    if (!contract) return { error: "合同不存在或无权访问" };
    if (!isSignedContractStatus(contract.status)) {
      return { error: "仅已签署合同可登记回款" };
    }

    const paymentRecords = await prisma.contractPaymentRecord.findMany({
      where: { contractId: parsed.contractId },
      select: { amount: true },
    });
    const totalPaid = sumPaymentRecords(paymentRecords);
    const totalAmount = Number(contract.totalAmount);
    const amountError = validateContractPaymentAmount(totalAmount, totalPaid, parsed.amount);
    if (amountError) return { error: amountError };

    await prisma.contractPaymentRecord.create({
      data: {
        contractId: parsed.contractId,
        amount: parsed.amount,
        paidAt: new Date(parsed.paidAt),
        notes: parsed.notes?.trim() || undefined,
        recordedById: session.user.id,
      },
    });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: parsed.contractId,
      userId: session.user.id,
      action: "回款",
      summary: `登记回款 ${parsed.amount.toFixed(2)} 元（合同「${contract.title}」）`,
      detail: parsed.notes?.trim() || undefined,
    });

    revalidatePath(`/contracts/${parsed.contractId}`);
    revalidatePath("/plans-tasks");

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function deleteContractPaymentRecord(recordId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);

    const record = await prisma.contractPaymentRecord.findUnique({
      where: { id: recordId },
      include: { contract: { select: { id: true, title: true } } },
    });
    if (!record) return { error: "回款记录不存在" };

    await prisma.contractPaymentRecord.delete({ where: { id: recordId } });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: record.contract.id,
      userId: session.user.id,
      action: "删除回款",
      summary: `删除回款 ${Number(record.amount).toFixed(2)} 元（合同「${record.contract.title}」）`,
    });

    revalidatePath(`/contracts/${record.contract.id}`);
    revalidatePath("/plans-tasks");
    revalidatePath("/contracts/external-costs");

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function addContractInvoiceRecord(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    if (!canRecordContractPayment(session.user.role)) {
      return { error: "无权登记开票" };
    }

    const parsed = contractInvoiceRecordSchema.parse({
      contractId: formData.get("contractId"),
      amount: formData.get("amount"),
      taxRatePercent: formData.get("taxRatePercent"),
      invoicedAt: formData.get("invoicedAt"),
      invoiceNo: formData.get("invoiceNo") || undefined,
      notes: formData.get("notes") || undefined,
    });

    const contract = await getContractForUser(
      parsed.contractId,
      session.user.role,
      session.user.id
    );
    if (!contract) return { error: "合同不存在或无权访问" };
    if (!isSignedContractStatus(contract.status)) {
      return { error: "仅已签署合同可登记开票" };
    }

    const created = await prisma.contractInvoiceRecord.create({
      data: {
        contractId: parsed.contractId,
        amount: parsed.amount,
        taxRatePercent: parsed.taxRatePercent,
        invoicedAt: new Date(parsed.invoicedAt),
        invoiceNo: parsed.invoiceNo?.trim() || undefined,
        notes: parsed.notes?.trim() || undefined,
        recordedById: session.user.id,
      },
    });

    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      const { saveContractInvoiceAttachmentFile } = await import(
        "@/lib/contracts/attachments"
      );
      const bytes = Buffer.from(await file.arrayBuffer());
      const { storageKey, sizeBytes } = await saveContractInvoiceAttachmentFile({
        contractId: parsed.contractId,
        invoiceRecordId: created.id,
        fileName: file.name,
        bytes,
      });
      await prisma.contractInvoiceAttachment.create({
        data: {
          invoiceRecordId: created.id,
          fileName: file.name.slice(0, 200),
          mimeType: file.type || "application/octet-stream",
          sizeBytes,
          storageKey,
          uploadedById: session.user.id,
        },
      });
    }

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: parsed.contractId,
      userId: session.user.id,
      action: "开票",
      summary: `登记开票 ${parsed.amount.toFixed(2)} 元 · ${parsed.taxRatePercent} 个点（合同「${contract.title}」）`,
      detail: parsed.invoiceNo?.trim()
        ? `发票号码 ${parsed.invoiceNo.trim()}${parsed.notes?.trim() ? `；${parsed.notes.trim()}` : ""}`
        : parsed.notes?.trim() || undefined,
    });

    revalidatePath(`/contracts/${parsed.contractId}`);
    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function deleteContractInvoiceRecord(recordId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);

    const record = await prisma.contractInvoiceRecord.findUnique({
      where: { id: recordId },
      include: {
        contract: { select: { id: true, title: true } },
        attachments: { select: { storageKey: true } },
      },
    });
    if (!record) return { error: "开票记录不存在" };

    const { deleteContractAttachmentFile } = await import("@/lib/contracts/attachments");
    for (const att of record.attachments) {
      await deleteContractAttachmentFile(att.storageKey);
    }

    await prisma.contractInvoiceRecord.delete({ where: { id: recordId } });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: record.contract.id,
      userId: session.user.id,
      action: "删除开票",
      summary: `删除开票 ${Number(record.amount).toFixed(2)} 元 · ${Number(record.taxRatePercent)} 个点（合同「${record.contract.title}」）`,
    });

    revalidatePath(`/contracts/${record.contract.id}`);
    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function addExternalCostPayoutRecord(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    if (!canRecordContractPayment(session.user.role)) {
      return { error: "无权登记外部成本实付" };
    }

    const parsed = externalCostPayoutRecordSchema.parse({
      contractProductId: formData.get("contractProductId"),
      amount: formData.get("amount"),
      paidAt: formData.get("paidAt"),
      notes: formData.get("notes") || undefined,
    });

    const product = await prisma.contractProduct.findUnique({
      where: { id: parsed.contractProductId },
      include: {
        contract: { select: { id: true, status: true, ownerId: true } },
        externalPayoutRecords: { select: { amount: true } },
      },
    });
    if (!product || product.costType !== "EXTERNAL") {
      return { error: "外部成本产品不存在" };
    }

    const contract = await getContractForUser(
      product.contractId,
      session.user.role,
      session.user.id
    );
    if (!contract) return { error: "合同不存在或无权访问" };
    if (!isSignedContractStatus(contract.status)) {
      return { error: "仅已签署合同可登记外部成本实付" };
    }

    const totalPaid = sumPaymentRecords(product.externalPayoutRecords);
    const totalAmount = Number(product.costAmount);
    const amountError = validateContractPaymentAmount(totalAmount, totalPaid, parsed.amount);
    if (amountError) {
      return { error: amountError.replace("回款", "实付").replace("合同金额", "应付总额") };
    }

    await prisma.externalCostPayoutRecord.create({
      data: {
        contractId: product.contractId,
        contractProductId: product.id,
        amount: parsed.amount,
        paidAt: new Date(parsed.paidAt),
        notes: parsed.notes?.trim() || undefined,
        recordedById: session.user.id,
      },
    });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: product.contractId,
      userId: session.user.id,
      action: "外部实付",
      summary: `登记外部成本「${product.productName}」实付 ${parsed.amount.toFixed(2)} 元（合同「${contract.title}」）`,
      detail: parsed.notes?.trim() || undefined,
    });

    revalidatePath(`/contracts/${product.contractId}`);
    revalidatePath("/contracts/external-costs");
    revalidatePath("/plans-tasks");

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function deleteExternalCostPayoutRecord(recordId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);

    const record = await prisma.externalCostPayoutRecord.findUnique({
      where: { id: recordId },
      include: {
        contract: { select: { id: true, title: true } },
        contractProduct: { select: { productName: true } },
      },
    });
    if (!record) return { error: "实付记录不存在" };

    await prisma.externalCostPayoutRecord.delete({ where: { id: recordId } });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: record.contractId,
      userId: session.user.id,
      action: "删除外部实付",
      summary: `删除外部成本「${record.contractProduct.productName}」实付 ${Number(record.amount).toFixed(2)} 元（合同「${record.contract.title}」）`,
    });

    revalidatePath(`/contracts/${record.contractId}`);
    revalidatePath("/contracts/external-costs");
    revalidatePath("/plans-tasks");

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function updateExternalCostPlan(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const installments = parseJsonField(formData.get("installmentsJson"), "付款计划");

    const product = await prisma.contractProduct.findUnique({
      where: { id: String(formData.get("contractProductId") || "") },
      include: {
        externalPayoutRecords: { select: { amount: true } },
        contract: { select: { id: true, title: true, ownerId: true } },
      },
    });
    if (!product || product.costType !== "EXTERNAL") {
      return { error: "外部成本产品不存在" };
    }

    const lockedCostAmount = Number(product.costAmount || product.actualCostPrice);
    const parsed = externalCostInstallmentsUpdateSchema.parse({
      contractProductId: product.id,
      costAmount: lockedCostAmount,
      installments,
    });

    const contract = await getContractForUser(
      product.contractId,
      session.user.role,
      session.user.id
    );
    if (!contract) return { error: "合同不存在或无权访问" };

    const canEditPlan =
      canEditContract(session.user.role) || contract.ownerId === session.user.id;
    if (!canEditPlan) return { error: "无权修改外部付款计划" };

    const totalPaid = sumPaymentRecords(product.externalPayoutRecords);
    if (lockedCostAmount + 0.01 < totalPaid) {
      return { error: `应付总额不能低于已实付 ${totalPaid.toFixed(2)} 元` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.externalCostInstallment.deleteMany({
        where: { contractProductId: product.id },
      });
      await tx.externalCostInstallment.createMany({
        data: parsed.installments.map((row) => ({
          contractProductId: product.id,
          periodNumber: row.periodNumber,
          amount: row.amount,
          condition: row.condition?.trim() || undefined,
          dueAt: row.dueAt ? new Date(row.dueAt) : undefined,
        })),
      });
    });

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CONTRACT,
      entityId: product.contractId,
      userId: session.user.id,
      action: "调整外部计划",
      summary: `调整外部成本「${product.productName}」付款计划（合同「${contract.title}」）`,
    });

    revalidatePath(`/contracts/${product.contractId}`);
    revalidatePath("/contracts/external-costs");

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}
