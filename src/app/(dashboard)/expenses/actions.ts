"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExpenseCostTarget, SalesCostType } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import {
  ALL_AUTHED_ROLES,
  canFinanceExpense,
  getExpenseCategoryRule,
} from "@/lib/expenses/labels";
import {
  assertInvoicesReadyForManagerApproval,
  claimInclude,
  canViewClaim,
  notifyExpensePaid,
  postInvoiceCosts,
  recalculateClaimTotal,
} from "@/lib/expenses/service";
import {
  deleteExpenseInvoiceFile,
  saveExpenseInvoiceFile,
} from "@/lib/expenses/attachments";
import {
  assertInvoiceOcrSupported,
  extractInvoiceFieldsFromFile,
} from "@/lib/contracts/invoice-ocr";

function revalidateExpense(claimId?: string) {
  revalidatePath("/expenses");
  revalidatePath("/approvals");
  revalidatePath("/sales-costs");
  revalidatePath("/projects");
  revalidatePath("/notifications");
  if (claimId) revalidatePath(`/expenses/${claimId}`);
}

export async function createExpenseClaimDraft(formData: FormData): Promise<ActionResult & { id?: string }> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const title = String(formData.get("title") ?? "").trim() || "报销申请";
    const description = String(formData.get("description") ?? "").trim() || null;
    const claim = await prisma.expenseClaim.create({
      data: {
        applicantId: session.user.id,
        title,
        description,
        status: "DRAFT",
      },
    });
    revalidateExpense(claim.id);
    return { id: claim.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "创建失败" };
  }
}

export async function updateExpenseClaimDraft(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
    if (!claim) return { error: "报销单不存在" };
    if (claim.applicantId !== session.user.id && session.user.role !== "ADMIN") {
      return { error: "无权编辑" };
    }
    if (claim.status !== "DRAFT" && claim.status !== "REJECTED") {
      return { error: "仅草稿或已驳回单据可编辑" };
    }
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { error: "请填写标题" };
    await prisma.expenseClaim.update({
      where: { id: claimId },
      data: {
        title,
        description: String(formData.get("description") ?? "").trim() || null,
        status: "DRAFT",
        rejectReason: null,
        rejectedAt: null,
      },
    });
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
}

export async function addExpenseTrip(claimId: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.applicantId !== session.user.id) return { error: "无权操作" };
    if (claim.status !== "DRAFT" && claim.status !== "REJECTED") return { error: "当前状态不可改行程" };
    const startDate = new Date(String(formData.get("startDate") ?? ""));
    const endDate = new Date(String(formData.get("endDate") ?? ""));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { error: "行程日期无效" };
    }
    if (endDate < startDate) return { error: "结束日期不能早于开始日期" };
    const fromCity = String(formData.get("fromCity") ?? "").trim() || null;
    const city = String(formData.get("city") ?? "").trim() || null;
    const customerId = String(formData.get("customerId") ?? "").trim() || null;
    const description = String(formData.get("description") ?? "").trim() || null;
    const maxOrder = await prisma.expenseTrip.aggregate({
      where: { claimId },
      _max: { sortOrder: true },
    });
    await prisma.expenseTrip.create({
      data: {
        claimId,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        startDate,
        endDate,
        fromCity,
        city,
        customerId,
        description,
      },
    });
    if (claim.status === "REJECTED") {
      await prisma.expenseClaim.update({ where: { id: claimId }, data: { status: "DRAFT" } });
    }
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "添加行程失败" };
  }
}

export async function updateExpenseTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const trip = await prisma.expenseTrip.findUnique({
      where: { id: tripId },
      include: { claim: true },
    });
    if (!trip || trip.claim.applicantId !== session.user.id) return { error: "无权操作" };
    if (trip.claim.status !== "DRAFT" && trip.claim.status !== "REJECTED") {
      return { error: "当前状态不可编辑行程" };
    }
    const startDate = new Date(String(formData.get("startDate") ?? ""));
    const endDate = new Date(String(formData.get("endDate") ?? ""));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { error: "行程日期无效" };
    }
    if (endDate < startDate) return { error: "结束日期不能早于开始日期" };
    await prisma.expenseTrip.update({
      where: { id: tripId },
      data: {
        startDate,
        endDate,
        fromCity: String(formData.get("fromCity") ?? "").trim() || null,
        city: String(formData.get("city") ?? "").trim() || null,
        customerId: String(formData.get("customerId") ?? "").trim() || null,
        description: String(formData.get("description") ?? "").trim() || null,
      },
    });
    revalidateExpense(trip.claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "更新行程失败" };
  }
}

export async function removeExpenseTrip(tripId: string): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const trip = await prisma.expenseTrip.findUnique({
      where: { id: tripId },
      include: { claim: true },
    });
    if (!trip || trip.claim.applicantId !== session.user.id) return { error: "无权操作" };
    if (trip.claim.status !== "DRAFT" && trip.claim.status !== "REJECTED") {
      return { error: "当前状态不可删除行程" };
    }
    await prisma.expenseTrip.delete({ where: { id: tripId } });
    revalidateExpense(trip.claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "删除失败" };
  }
}

export async function uploadExpenseInvoice(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.applicantId !== session.user.id) return { error: "无权操作" };
    if (claim.status !== "DRAFT" && claim.status !== "REJECTED") {
      return { error: "当前状态不可上传发票" };
    }
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "请选择发票文件" };
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) return { error: "文件为空" };
    if (bytes.length > 12 * 1024 * 1024) return { error: "文件过大（上限 12MB）" };
    const mimeType = file.type || "application/octet-stream";
    assertInvoiceOcrSupported(mimeType, file.name);

    const categoryKey = String(formData.get("categoryKey") ?? "").trim() || "other";
    const rule = getExpenseCategoryRule(categoryKey);

    let ocr;
    try {
      ocr = await extractInvoiceFieldsFromFile({
        bytes,
        mimeType,
        fileName: file.name,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "OCR 失败" };
    }

    const saved = await saveExpenseInvoiceFile({
      claimId,
      fileName: file.name,
      bytes,
    });

    const count = await prisma.expenseInvoice.count({ where: { claimId } });
    await prisma.expenseInvoice.create({
      data: {
        claimId,
        fileName: file.name,
        mimeType,
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        categoryKey,
        amount: ocr.amount,
        taxRatePercent: ocr.taxRatePercent,
        invoiceNo: ocr.invoiceNo,
        invoicedAt: ocr.invoicedAt ? new Date(ocr.invoicedAt) : null,
        sellerName: ocr.sellerName,
        ocrNotes: ocr.notes,
        ocrConfidence: ocr.confidence,
        ocrRawSummary: ocr.rawSummary,
        costTarget: rule?.suggestedTarget ?? null,
        salesCostType: rule?.suggestedSalesCostType ?? null,
        sortOrder: count,
      },
    });
    await recalculateClaimTotal(claimId);
    if (claim.status === "REJECTED") {
      await prisma.expenseClaim.update({ where: { id: claimId }, data: { status: "DRAFT" } });
    }
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "上传失败" };
  }
}

export async function updateExpenseInvoiceAllocation(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const invoice = await prisma.expenseInvoice.findUnique({
      where: { id: invoiceId },
      include: { claim: true },
    });
    if (!invoice) return { error: "发票不存在" };
    const claim = invoice.claim;
    const isApplicant = claim.applicantId === session.user.id;
    const isManager =
      claim.status === "PENDING_MANAGER" &&
      (claim.managerId === session.user.id || session.user.role === "ADMIN");
    const isAdmin = session.user.role === "ADMIN";
    if (!isApplicant && !isManager && !isAdmin) return { error: "无权修改归属" };
    if (
      isApplicant &&
      !isManager &&
      !isAdmin &&
      claim.status !== "DRAFT" &&
      claim.status !== "REJECTED"
    ) {
      return { error: "当前状态不可修改" };
    }

    const costTarget = (String(formData.get("costTarget") ?? "").trim() ||
      null) as ExpenseCostTarget | null;
    const salesCostType = (String(formData.get("salesCostType") ?? "").trim() ||
      null) as SalesCostType | null;
    const customerId = String(formData.get("customerId") ?? "").trim() || null;
    const projectId = String(formData.get("projectId") ?? "").trim() || null;
    const costCategory = String(formData.get("costCategory") ?? "").trim() || null;
    const categoryKey = String(formData.get("categoryKey") ?? "").trim() || invoice.categoryKey;
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const amount = amountRaw ? Number(amountRaw) : Number(invoice.amount ?? 0);

    await prisma.expenseInvoice.update({
      where: { id: invoiceId },
      data: {
        categoryKey,
        costTarget,
        salesCostType: costTarget === "SALES" ? salesCostType : null,
        customerId: costTarget === "SALES" ? customerId : null,
        projectId: costTarget === "PROJECT" ? projectId : null,
        costCategory,
        amount: Number.isFinite(amount) ? amount : invoice.amount,
      },
    });
    await recalculateClaimTotal(claim.id);
    revalidateExpense(claim.id);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
}

export async function removeExpenseInvoice(invoiceId: string): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const invoice = await prisma.expenseInvoice.findUnique({
      where: { id: invoiceId },
      include: { claim: true },
    });
    if (!invoice || invoice.claim.applicantId !== session.user.id) return { error: "无权操作" };
    if (invoice.claim.status !== "DRAFT" && invoice.claim.status !== "REJECTED") {
      return { error: "当前状态不可删除发票" };
    }
    await deleteExpenseInvoiceFile(invoice.storageKey);
    await prisma.expenseInvoice.delete({ where: { id: invoiceId } });
    await recalculateClaimTotal(invoice.claimId);
    revalidateExpense(invoice.claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "删除失败" };
  }
}

export async function submitExpenseClaim(claimId: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const managerId = String(formData.get("managerId") ?? "").trim();
    if (!managerId) return { error: "请选择上级审批人" };
    if (managerId === session.user.id) return { error: "不能指定自己为审批人" };

    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { invoices: true },
    });
    if (!claim || claim.applicantId !== session.user.id) return { error: "无权提交" };
    if (claim.status !== "DRAFT" && claim.status !== "REJECTED") {
      return { error: "当前状态不可提交" };
    }
    if (claim.invoices.length === 0) return { error: "请至少上传一张发票" };
    for (const inv of claim.invoices) {
      if (inv.amount == null || !(Number(inv.amount) > 0)) {
        return { error: "存在金额无效的发票，请先完善" };
      }
    }

    const manager = await prisma.user.findFirst({
      where: { id: managerId },
      select: { id: true },
    });
    if (!manager) return { error: "审批人不存在" };

    await recalculateClaimTotal(claimId);
    await prisma.expenseClaim.update({
      where: { id: claimId },
      data: {
        managerId,
        status: "PENDING_MANAGER",
        submittedAt: new Date(),
        rejectedAt: null,
        rejectReason: null,
      },
    });
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "提交失败" };
  }
}

export async function approveExpenseByManager(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { invoices: true },
    });
    if (!claim) return { error: "报销单不存在" };
    if (claim.status !== "PENDING_MANAGER") return { error: "不在待上级审批状态" };
    if (claim.managerId !== session.user.id && session.user.role !== "ADMIN") {
      return { error: "仅指定上级可审批" };
    }
    assertInvoicesReadyForManagerApproval(claim.invoices);

    const comment = String(formData.get("comment") ?? "").trim() || null;
    await prisma.$transaction(async (tx) => {
      await tx.expenseApproval.create({
        data: {
          claimId,
          step: "MANAGER",
          action: "APPROVED",
          actorId: session.user.id,
          comment,
        },
      });
      await tx.expenseClaim.update({
        where: { id: claimId },
        data: { status: "PENDING_PAYOUT" },
      });
    });
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "审批失败" };
  }
}

export async function rejectExpenseByManager(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
    if (!claim) return { error: "报销单不存在" };
    if (claim.status !== "PENDING_MANAGER") return { error: "不在待上级审批状态" };
    if (claim.managerId !== session.user.id && session.user.role !== "ADMIN") {
      return { error: "仅指定上级可驳回" };
    }
    const reason = String(formData.get("comment") ?? "").trim() || "上级驳回";
    await prisma.$transaction(async (tx) => {
      await tx.expenseApproval.create({
        data: {
          claimId,
          step: "MANAGER",
          action: "REJECTED",
          actorId: session.user.id,
          comment: reason,
        },
      });
      await tx.expenseClaim.update({
        where: { id: claimId },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectReason: reason,
        },
      });
    });
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "驳回失败" };
  }
}

export async function payoutExpenseClaim(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    if (!canFinanceExpense(session.user.role)) return { error: "仅财务/行政可打款结案" };

    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { invoices: true, applicant: { select: { id: true, name: true } } },
    });
    if (!claim) return { error: "报销单不存在" };
    if (claim.status !== "PENDING_PAYOUT") return { error: "不在待打款状态" };
    assertInvoicesReadyForManagerApproval(claim.invoices);

    const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
    if (Number.isNaN(paidAt.getTime())) return { error: "打款日期无效" };
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const amount = Number(claim.totalAmount);

    await prisma.$transaction(async (tx) => {
      await tx.expenseApproval.create({
        data: {
          claimId,
          step: "FINANCE",
          action: "APPROVED",
          actorId: session.user.id,
          comment: notes,
        },
      });
      await tx.expensePayout.create({
        data: {
          claimId,
          amount,
          paidAt,
          notes,
          recordedById: session.user.id,
        },
      });
      await postInvoiceCosts({
        claimId,
        applicantId: claim.applicantId,
        recordedById: session.user.id,
        tx,
      });
      await tx.expenseClaim.update({
        where: { id: claimId },
        data: { status: "PAID", paidAt },
      });
    });

    await notifyExpensePaid({
      applicantId: claim.applicantId,
      claimId,
      title: claim.title,
      amount,
    });
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "打款失败" };
  }
}

export async function deleteExpenseClaim(claimId: string): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { invoices: true },
    });
    if (!claim) return { error: "不存在" };
    if (claim.applicantId !== session.user.id && session.user.role !== "ADMIN") {
      return { error: "无权删除" };
    }
    if (claim.status !== "DRAFT" && claim.status !== "REJECTED") {
      return { error: "仅草稿或已驳回可删除" };
    }
    for (const inv of claim.invoices) {
      await deleteExpenseInvoiceFile(inv.storageKey);
    }
    await prisma.expenseClaim.delete({ where: { id: claimId } });
    revalidateExpense();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "删除失败" };
  }
}

export async function requireExpenseClaimAccess(claimId: string) {
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  const claim = await prisma.expenseClaim.findUnique({
    where: { id: claimId },
    include: claimInclude,
  });
  if (!claim || !canViewClaim(claim, session.user)) {
    redirect("/expenses");
  }
  return { session, claim };
}
