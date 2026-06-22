"use server";

import { revalidatePath } from "next/cache";
import { UserRole, ContractStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  canManageContractApproval,
  canRecordContractPayment,
  isSignedContractStatus,
} from "@/lib/contracts/access";
import { finalizeSignedContract } from "@/lib/contracts/finalize";
import {
  contractFormSchema,
  contractPaymentRecordSchema,
  contractRejectSchema,
} from "@/lib/validations/contract";
import {
  canManageOpportunityOwner,
  getContractForUser,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { canSignOpportunity } from "@/lib/opportunities/status";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";

function parseOwnerField(raw: FormDataEntryValue | null): string | null {
  const value = raw?.toString().trim() ?? "";
  if (!value || value === POOL_OWNER_VALUE) return null;
  return value;
}

function resolveOwnerId(role: UserRole, userId: string, ownerId: string | null | undefined) {
  if (role === "SALES") return userId;
  if (canManageOpportunityOwner(role) && ownerId) return ownerId;
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
  if (!contact) throw new Error("甲方代表须为签约客户的联系人");
}

async function createContractCore(
  session: { user: { id: string; role: UserRole } },
  parsed: ReturnType<typeof contractFormSchema.parse>,
  contractId?: string
): Promise<ActionResult & { contractId?: string }> {
  const ownerId = resolveOwnerId(session.user.role, session.user.id, parsed.ownerId);
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
      await tx.contractProduct.deleteMany({ where: { contractId } });
      await tx.paymentInstallment.deleteMany({ where: { contractId } });
    }

    await tx.contractProduct.createMany({
      data: parsed.products.map((row) => ({
        contractId: created.id,
        productServiceId: row.productServiceId || undefined,
        productName: row.productName.trim(),
        costAmount: row.costAmount,
        actualCostPrice: row.costAmount,
        baselineCostPrice: row.costAmount,
        salesAmount: 0,
      })),
    });

    await tx.paymentInstallment.createMany({
      data: parsed.installments.map((row) => ({
        contractId: created.id,
        periodNumber: row.periodNumber,
        amount: row.amount,
        condition: row.condition?.trim() || undefined,
        dueAt: row.dueAt ? new Date(row.dueAt) : undefined,
      })),
    });

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
  revalidatePath("/approvals");
  revalidatePath("/opportunities");
  revalidatePath("/projects");

  return {
    redirectTo: `/contracts/${contract.id}`,
    contractId: contract.id,
  };
}

export async function createContract(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseContractForm(formData);
    return await createContractCore(session, parsed);
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
    if (contract.status !== "REJECTED") return { error: "仅已驳回合同可重新提交" };

    const parsed = parseContractForm(formData);
    return await createContractCore(session, parsed, contractId);
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
    if (!contract || contract.status !== "PENDING_APPROVAL") {
      return { error: "合同不存在或不在待审核状态" };
    }
    if (!contract.signedAt) {
      return { error: "合同缺少签约日期" };
    }

    const signedAt = contract.signedAt;

    await prisma.$transaction(async (tx) => {
      await finalizeSignedContract(tx, {
        contractId,
        signedAt,
        approverId: session.user.id,
      });
    });

    revalidatePath("/contracts");
    revalidatePath("/approvals");
    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/opportunities");
    revalidatePath("/projects");

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
    if (!contract || contract.status !== "PENDING_APPROVAL") {
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

    revalidatePath("/contracts");
    revalidatePath("/approvals");
    revalidatePath(`/contracts/${parsed.contractId}`);

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

    await prisma.contractPaymentRecord.create({
      data: {
        contractId: parsed.contractId,
        amount: parsed.amount,
        paidAt: new Date(parsed.paidAt),
        notes: parsed.notes?.trim() || undefined,
        recordedById: session.user.id,
      },
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
      include: { contract: { select: { id: true } } },
    });
    if (!record) return { error: "回款记录不存在" };

    await prisma.contractPaymentRecord.delete({ where: { id: recordId } });

    revalidatePath(`/contracts/${record.contract.id}`);
    revalidatePath("/plans-tasks");

    return {};
  } catch (error) {
    return formatActionError(error);
  }
}
