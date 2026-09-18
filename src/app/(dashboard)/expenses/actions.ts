"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExpenseCostTarget, ExpenseItemKind, SalesCostType } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import {
  ALL_AUTHED_ROLES,
} from "@/lib/expenses/labels";
import { hasPermission } from "@/lib/rbac/has-permission";
import type { UserRole } from "@prisma/client";
import {
  assertInvoicesReadyForManagerApproval,
  claimInclude,
  canEditClaimDraft,
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
import { getExpenseFeeCategoryByKey } from "@/lib/expenses/fee-categories";
import { evaluateHotelCapForInvoices } from "@/lib/expenses/hotel-cap";
import {
  approvalRecordStepForFlow,
  approverCandidateFilter,
  buildSubmitFlowSnapshot,
  getClaimActivePath,
  getClaimCurrentStep,
  getClaimCurrentStepIndex,
  getExpenseFlowSnapshotFromConfig,
  partyMatches,
  resolveClaimFlowSnapshot,
  statusForActiveStep,
  userCanActOnFlowStep,
} from "@/lib/expenses/approval-flow";

function revalidateExpense(claimId?: string, projectId?: string | null) {
  revalidatePath("/expenses");
  revalidatePath("/mobile/expenses");
  revalidatePath("/approvals");
  revalidatePath("/sales-costs");
  revalidatePath("/projects");
  revalidatePath("/notifications");
  if (claimId) {
    revalidatePath(`/expenses/${claimId}`);
    revalidatePath(`/mobile/expenses/${claimId}`);
  }
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}

async function requireEditableClaim(claimId: string) {
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
  if (!claim) return { error: "报销单不存在" as const };
  if (!canEditClaimDraft(claim, session.user)) {
    return { error: "无权编辑或当前状态不可改" as const };
  }
  return { session, claim };
}

/** 按实际报销人刷新「首个审批节点」候选人（代填切换报销人时用） */
export async function getExpenseApproverOptionsForBeneficiary(
  beneficiaryId: string
): Promise<
  | {
      managers: Array<{ id: string; name: string }>;
      requiresSuperiorPick: boolean;
      superiorStepName: string | null;
    }
  | { error: string }
> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    if (!(await hasPermission(session.user.role, "expense.access"))) {
      return { error: "无权使用报销功能" };
    }
    const beneficiary = await prisma.user.findUnique({
      where: { id: beneficiaryId },
      select: { id: true, role: true },
    });
    if (!beneficiary) return { error: "实际报销人不存在" };
    if (
      beneficiary.id !== session.user.id &&
      !(await hasPermission(session.user.role, "expense.proxy_beneficiary"))
    ) {
      return { error: "无权代他人选择审批人" };
    }
    const { loadExpenseApproverOptionsForApplicant } = await import(
      "@/lib/expenses/editor-options"
    );
    return loadExpenseApproverOptionsForApplicant(beneficiary, [
      session.user.id,
      beneficiary.id,
    ]);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "加载审批人失败" };
  }
}

export async function createExpenseClaimDraft(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    if (!(await hasPermission(session.user.role, "expense.access"))) {
      return { error: "无权使用报销功能" };
    }
    const claimKindRaw = String(formData.get("claimKind") ?? "").trim();
    const claimKind =
      claimKindRaw === "TRAVEL" || claimKindRaw === "FEE" || claimKindRaw === "PROJECT"
        ? claimKindRaw
        : formData.get("projectId")
          ? "PROJECT"
          : "FEE";
    const projectId = String(formData.get("projectId") ?? "").trim() || null;
    const titleInput = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    let beneficiaryId =
      String(formData.get("beneficiaryId") ?? "").trim() || session.user.id;
    if (!(await hasPermission(session.user.role, "expense.proxy_beneficiary"))) {
      beneficiaryId = session.user.id;
    }

    if (claimKind === "PROJECT" && !projectId) {
      return { error: "项目报销请先选择项目" };
    }
    if (beneficiaryId !== session.user.id) {
      const beneficiary = await prisma.user.findUnique({
        where: { id: beneficiaryId },
        select: { id: true },
      });
      if (!beneficiary) return { error: "实际报销人不存在" };
    }

    let projectName: string | null = null;
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true },
      });
      if (!project) return { error: "项目不存在" };
      projectName = project.name;
    }

    const defaultTitles = {
      TRAVEL: "差旅报销",
      FEE: "费用报销",
      PROJECT: "项目报销",
    } as const;
    const title =
      titleInput ||
      (claimKind === "PROJECT" && projectName
        ? `${projectName} · 报销`
        : defaultTitles[claimKind]);

    const claim = await prisma.expenseClaim.create({
      data: {
        applicantId: session.user.id,
        beneficiaryId,
        projectId: claimKind === "PROJECT" ? projectId : null,
        claimKind,
        title,
        description,
        status: "DRAFT",
      },
    });

    // 进入编辑页即有一行明细
    const defaultItem =
      claimKind === "TRAVEL"
        ? { kind: "OTHER" as const, categoryKey: "lodging", title: "住宿费" }
        : claimKind === "FEE"
          ? { kind: "OTHER" as const, categoryKey: "other", title: "其他" }
          : {
              kind: "OTHER" as const,
              categoryKey: "lodging",
              title: "住宿费",
              projectId: projectId,
            };
    await prisma.expenseClaimItem.create({
      data: {
        claimId: claim.id,
        kind: defaultItem.kind,
        categoryKey: defaultItem.categoryKey,
        title: defaultItem.title,
        projectId: "projectId" in defaultItem ? defaultItem.projectId : null,
        sortOrder: 0,
      },
    });

    revalidateExpense(claim.id, claim.projectId);
    return { id: claim.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "创建失败" };
  }
}

function buildAutoExpenseTitle(
  items: { kind: ExpenseItemKind; project?: { name: string } | null }[]
): string {
  const labels: string[] = [];
  for (const item of items) {
    const base =
      item.kind === "TRAVEL" ? "差旅" : item.kind === "OTHER" ? "其他" : "项目";
    labels.push(item.project?.name ? `${item.project.name}${base}` : base);
  }
  const unique = [...new Set(labels)];
  if (unique.length === 0) return "报销申请";
  return `${unique.join("、")}报销`;
}

export async function updateExpenseClaimDraft(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const loaded = await requireEditableClaim(claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };
    const { claim } = loaded as { claim: NonNullable<Awaited<ReturnType<typeof prisma.expenseClaim.findUnique>>> };

    const titleRaw = String(formData.get("title") ?? "").trim();
    const loadedSession = loaded as {
      session: { user: { id: string; role: UserRole } };
      claim: NonNullable<Awaited<ReturnType<typeof prisma.expenseClaim.findUnique>>>;
    };
    let beneficiaryId =
      String(formData.get("beneficiaryId") ?? "").trim() || claim.beneficiaryId;
    if (!(await hasPermission(loadedSession.session.user.role, "expense.proxy_beneficiary"))) {
      beneficiaryId = loadedSession.session.user.id;
    }

    if (beneficiaryId !== claim.beneficiaryId) {
      const beneficiary = await prisma.user.findUnique({
        where: { id: beneficiaryId },
        select: { id: true },
      });
      if (!beneficiary) return { error: "实际报销人不存在" };
    }

    await prisma.expenseClaim.update({
      where: { id: claimId },
      data: {
        ...(titleRaw ? { title: titleRaw } : {}),
        description: String(formData.get("description") ?? "").trim() || null,
        beneficiaryId,
        status: "DRAFT",
        rejectReason: null,
        rejectedAt: null,
      },
    });
    revalidateExpense(claimId, claim.projectId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
}

export async function addExpenseClaimItem(
  claimId: string,
  formData: FormData
): Promise<ActionResult & { itemId?: string }> {
  try {
    const loaded = await requireEditableClaim(claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };
    const { claim } = loaded as { claim: { id: string; projectId: string | null; status: string } };

    const kind = String(formData.get("kind") ?? "").trim() as ExpenseItemKind;
    if (kind !== "TRAVEL" && kind !== "OTHER") {
      return { error: "请选择报销类型" };
    }
    const title = String(formData.get("title") ?? "").trim() || null;
    const customerId = String(formData.get("customerId") ?? "").trim() || null;
    const projectId = String(formData.get("projectId") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const categoryKey =
      kind === "TRAVEL" ? null : String(formData.get("categoryKey") ?? "").trim() || "other";

    const maxOrder = await prisma.expenseClaimItem.aggregate({
      where: { claimId },
      _max: { sortOrder: true },
    });
    const defaultTitle = kind === "TRAVEL" ? "差旅报销" : title || "其他报销";
    const item = await prisma.expenseClaimItem.create({
      data: {
        claimId,
        kind,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        title: defaultTitle,
        categoryKey,
        customerId: kind === "TRAVEL" ? customerId : null,
        projectId,
        notes,
      },
    });
    if (projectId && !claim.projectId) {
      await prisma.expenseClaim.update({
        where: { id: claimId },
        data: { projectId },
      });
    }
    if (claim.status === "REJECTED") {
      await prisma.expenseClaim.update({
        where: { id: claimId },
        data: { status: "DRAFT" },
      });
    }
    revalidateExpense(claimId, projectId);
    return { itemId: item.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "添加项目失败" };
  }
}

export async function updateExpenseClaimItem(
  itemId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const item = await prisma.expenseClaimItem.findUnique({
      where: { id: itemId },
      include: { claim: true },
    });
    if (!item) return { error: "项目不存在" };
    const loaded = await requireEditableClaim(item.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };

    const isProjectExpense =
      formData.get("isProjectExpense") === "1" ||
      formData.get("isProjectExpense") === "on" ||
      formData.get("isProjectExpense") === "true";
    const nextProjectId = isProjectExpense
      ? String(formData.get("projectId") ?? "").trim() || null
      : null;
    if (isProjectExpense && !nextProjectId) {
      return { error: "勾选项目报销后请选择项目" };
    }

    const kindRaw = String(formData.get("kind") ?? "").trim();
    const nextKind: ExpenseItemKind =
      kindRaw === "TRAVEL" || kindRaw === "OTHER"
        ? kindRaw
        : item.kind === "TRAVEL"
          ? "TRAVEL"
          : "OTHER";
    const categoryKey =
      nextKind === "TRAVEL"
        ? null
        : String(formData.get("categoryKey") ?? "").trim() || item.categoryKey || "other";

    await prisma.expenseClaimItem.update({
      where: { id: itemId },
      data: {
        kind: nextKind,
        categoryKey,
        title: String(formData.get("title") ?? "").trim() || item.title,
        customerId:
          nextKind === "TRAVEL"
            ? String(formData.get("customerId") ?? "").trim() || null
            : null,
        projectId: nextProjectId,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });
    if (nextProjectId && !item.claim.projectId) {
      await prisma.expenseClaim.update({
        where: { id: item.claimId },
        data: { projectId: nextProjectId },
      });
    }
    revalidateExpense(item.claimId, nextProjectId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "更新项目失败" };
  }
}

export async function removeExpenseClaimItem(itemId: string): Promise<ActionResult> {
  try {
    const item = await prisma.expenseClaimItem.findUnique({
      where: { id: itemId },
      include: {
        claim: true,
        invoices: { select: { storageKey: true } },
      },
    });
    if (!item) return { error: "项目不存在" };
    const loaded = await requireEditableClaim(item.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };

    for (const inv of item.invoices) {
      await deleteExpenseInvoiceFile(inv.storageKey);
    }
    await prisma.expenseClaimItem.delete({ where: { id: itemId } });
    await recalculateClaimTotal(item.claimId);
    revalidateExpense(item.claimId, item.projectId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "删除失败" };
  }
}

export async function addExpenseTrip(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const loaded = await requireEditableClaim(claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };
    const { claim } = loaded as {
      claim: { id: string; claimKind: string; status: string };
    };

    // 差旅单：行程挂在整单；其他类型仍允许挂费用行（兼容旧数据）
    const itemIdRaw = String(formData.get("itemId") ?? "").trim() || null;
    if (claim.claimKind !== "TRAVEL" && !itemIdRaw) {
      return { error: "请指定费用行后再添加行程" };
    }
    if (itemIdRaw) {
      const item = await prisma.expenseClaimItem.findFirst({
        where: { id: itemIdRaw, claimId },
        select: { id: true },
      });
      if (!item) return { error: "费用行不存在" };
    }

    const startDate = new Date(String(formData.get("startDate") ?? ""));
    const endRaw = String(formData.get("endDate") ?? "").trim();
    const endDate = endRaw ? new Date(endRaw) : startDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { error: "行程日期无效" };
    }
    if (endDate < startDate) return { error: "到达日期不能早于出发日期" };
    const fromCity = String(formData.get("fromCity") ?? "").trim() || null;
    const city = String(formData.get("city") ?? "").trim() || null;
    if (!fromCity) return { error: "请填写出发地" };
    if (!city) return { error: "请填写到达地点" };
    const customerId = String(formData.get("customerId") ?? "").trim() || null;
    const description = String(formData.get("description") ?? "").trim() || null;
    const maxOrder = await prisma.expenseTrip.aggregate({
      where: { claimId },
      _max: { sortOrder: true },
    });
    await prisma.expenseTrip.create({
      data: {
        claimId,
        itemId: claim.claimKind === "TRAVEL" ? null : itemIdRaw,
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
      await prisma.expenseClaim.update({
        where: { id: claimId },
        data: { status: "DRAFT" },
      });
    }
    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "添加行程失败" };
  }
}

export async function updateExpenseTrip(tripId: string, formData: FormData): Promise<ActionResult> {
  try {
    const trip = await prisma.expenseTrip.findUnique({
      where: { id: tripId },
      include: { claim: true },
    });
    if (!trip) return { error: "行程不存在" };
    const loaded = await requireEditableClaim(trip.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };

    const startDate = new Date(String(formData.get("startDate") ?? ""));
    const endRaw = String(formData.get("endDate") ?? "").trim();
    const endDate = endRaw ? new Date(endRaw) : startDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { error: "行程日期无效" };
    }
    if (endDate < startDate) return { error: "到达日期不能早于出发日期" };
    const fromCity = String(formData.get("fromCity") ?? "").trim() || null;
    const city = String(formData.get("city") ?? "").trim() || null;
    if (!fromCity) return { error: "请填写出发地" };
    if (!city) return { error: "请填写到达地点" };
    await prisma.expenseTrip.update({
      where: { id: tripId },
      data: {
        startDate,
        endDate,
        fromCity,
        city,
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

export async function saveExpenseTrips(
  claimId: string,
  tripsInput: Array<{
    id?: string | null;
    startDate: string;
    endDate: string;
    fromCity: string;
    city: string;
  }>
): Promise<ActionResult> {
  try {
    const loaded = await requireEditableClaim(claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };
    const { claim } = loaded as {
      claim: { id: string; claimKind: string; status: string };
    };

    if (!Array.isArray(tripsInput) || tripsInput.length === 0) {
      return { error: "请至少填写一段行程" };
    }

    const parsed: Array<{
      id: string | null;
      startDate: Date;
      endDate: Date;
      fromCity: string;
      city: string;
    }> = [];

    for (let i = 0; i < tripsInput.length; i++) {
      const row = tripsInput[i];
      const startDate = new Date(String(row.startDate ?? ""));
      const endRaw = String(row.endDate ?? "").trim();
      const endDate = endRaw ? new Date(endRaw) : startDate;
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return { error: `第 ${i + 1} 段行程日期无效` };
      }
      if (endDate < startDate) {
        return { error: `第 ${i + 1} 段到达日期不能早于出发日期` };
      }
      const fromCity = String(row.fromCity ?? "").trim();
      const city = String(row.city ?? "").trim();
      if (!fromCity) return { error: `第 ${i + 1} 段请填写出发地` };
      if (!city) return { error: `第 ${i + 1} 段请填写到达地点` };
      const id = String(row.id ?? "").trim() || null;
      parsed.push({ id, startDate, endDate, fromCity, city });
    }

    parsed.sort((a, b) => {
      const ds = a.startDate.getTime() - b.startDate.getTime();
      if (ds !== 0) return ds;
      return a.endDate.getTime() - b.endDate.getTime();
    });

    const existing = await prisma.expenseTrip.findMany({
      where: { claimId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((t) => t.id));

    for (const row of parsed) {
      if (row.id && !existingIds.has(row.id)) {
        return { error: "行程数据已变更，请刷新后重试" };
      }
    }

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i];
        if (row.id) {
          await tx.expenseTrip.update({
            where: { id: row.id },
            data: {
              sortOrder: i,
              startDate: row.startDate,
              endDate: row.endDate,
              fromCity: row.fromCity,
              city: row.city,
              itemId: claim.claimKind === "TRAVEL" ? null : undefined,
            },
          });
        } else {
          await tx.expenseTrip.create({
            data: {
              claimId,
              itemId: null,
              sortOrder: i,
              startDate: row.startDate,
              endDate: row.endDate,
              fromCity: row.fromCity,
              city: row.city,
            },
          });
        }
      }
      if (claim.status === "REJECTED") {
        await tx.expenseClaim.update({
          where: { id: claimId },
          data: { status: "DRAFT" },
        });
      }
    });

    revalidateExpense(claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存行程失败" };
  }
}

export async function removeExpenseTrip(tripId: string): Promise<ActionResult> {
  try {
    const trip = await prisma.expenseTrip.findUnique({
      where: { id: tripId },
      include: { claim: true },
    });
    if (!trip) return { error: "行程不存在" };
    const loaded = await requireEditableClaim(trip.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };
    await prisma.expenseTrip.delete({ where: { id: tripId } });
    revalidateExpense(trip.claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "删除失败" };
  }
}

export async function uploadExpenseInvoice(
  itemId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const item = await prisma.expenseClaimItem.findUnique({
      where: { id: itemId },
      include: { claim: true },
    });
    if (!item) return { error: "项目不存在" };
    const loaded = await requireEditableClaim(item.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };

    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "请选择发票文件" };
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) return { error: "文件为空" };
    if (bytes.length > 12 * 1024 * 1024) return { error: "文件过大（上限 12MB）" };
    const mimeType = file.type || "application/octet-stream";
    assertInvoiceOcrSupported(mimeType, file.name);

    const categoryKey =
      String(formData.get("categoryKey") ?? "").trim() ||
      item.categoryKey ||
      (item.kind === "TRAVEL" ? "transport" : "other");

    const categoryMeta = await getExpenseFeeCategoryByKey(categoryKey);
    const expectedCategoryLabel = categoryMeta?.label ?? null;

    let ocr;
    try {
      ocr = await extractInvoiceFieldsFromFile({
        bytes,
        mimeType,
        fileName: file.name,
        expectedCategoryLabel,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "OCR 失败" };
    }

    const saved = await saveExpenseInvoiceFile({
      claimId: item.claimId,
      fileName: file.name,
      bytes,
    });

    const existing = await prisma.expenseInvoice.findMany({
      where: { itemId },
      select: { id: true, storageKey: true, amount: true },
    });
    for (const row of existing) {
      if (row.storageKey.startsWith("manual://")) {
        await prisma.expenseInvoice.delete({ where: { id: row.id } });
      }
    }

    const count = await prisma.expenseInvoice.count({ where: { claimId: item.claimId } });
    const defaultProjectId = item.projectId || item.claim.projectId || null;
    const previousManual = existing.find((r) => r.storageKey.startsWith("manual://"));
    const amount =
      ocr.amount != null
        ? ocr.amount
        : previousManual?.amount != null
          ? Number(previousManual.amount)
          : null;

    let ocrRawSummary = ocr.rawSummary;
    if (ocr.categoryMatch === false && expectedCategoryLabel) {
      const guess = ocr.categoryGuess ? `，更像「${ocr.categoryGuess}」` : "";
      const mismatchNote = `类别可能不符：所选「${expectedCategoryLabel}」${guess}`;
      ocrRawSummary = ocrRawSummary ? `${mismatchNote}；${ocrRawSummary}` : mismatchNote;
    } else if (ocr.categoryGuess && expectedCategoryLabel && ocr.categoryMatch == null) {
      // 无法判断时保留猜测，方便人工核对
      const hint = `类别猜测：${ocr.categoryGuess}`;
      ocrRawSummary = ocrRawSummary ? `${ocrRawSummary}；${hint}` : hint;
    }

    await prisma.expenseInvoice.create({
      data: {
        claimId: item.claimId,
        itemId,
        fileName: file.name,
        mimeType,
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        categoryKey,
        amount,
        ocrAmount: ocr.amount,
        taxRatePercent: ocr.taxRatePercent,
        invoiceNo: ocr.invoiceNo,
        invoicedAt: ocr.invoicedAt ? new Date(ocr.invoicedAt) : null,
        sellerName: ocr.sellerName,
        ocrNotes: ocr.notes,
        ocrConfidence: ocr.confidence,
        ocrRawSummary,
        // 成本归属由审核人填写；上传时不预填 suggestedTarget
        costTarget: null,
        salesCostType: null,
        projectId: defaultProjectId,
        sortOrder: count,
      },
    });
    await recalculateClaimTotal(item.claimId);
    if (item.claim.status === "REJECTED") {
      await prisma.expenseClaim.update({
        where: { id: item.claimId },
        data: { status: "DRAFT" },
      });
    }
    revalidateExpense(item.claimId, defaultProjectId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "上传失败" };
  }
}

export async function updateExpenseInvoiceMeta(
  invoiceId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const invoice = await prisma.expenseInvoice.findUnique({
      where: { id: invoiceId },
      include: { claim: true },
    });
    if (!invoice) return { error: "发票不存在" };
    const loaded = await requireEditableClaim(invoice.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };

    const categoryKey =
      String(formData.get("categoryKey") ?? "").trim() || invoice.categoryKey;
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const amount = amountRaw ? Number(amountRaw) : Number(invoice.amount ?? 0);
    const nextAmount = Number.isFinite(amount) ? amount : Number(invoice.amount ?? 0);

    await prisma.expenseInvoice.update({
      where: { id: invoiceId },
      data: {
        categoryKey,
        amount: nextAmount,
      },
    });
    await recalculateClaimTotal(invoice.claimId);
    revalidateExpense(invoice.claimId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
}

/** 行内填写额度：有发票则改发票金额；无发票则创建「手填」占位发票 */
export async function setExpenseItemAmount(
  itemId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const item = await prisma.expenseClaimItem.findUnique({
      where: { id: itemId },
      include: {
        claim: true,
        invoices: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!item) return { error: "项目不存在" };
    const loaded = await requireEditableClaim(item.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };

    const amountRaw = String(formData.get("amount") ?? "").trim();
    const amount = amountRaw === "" ? 0 : Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) return { error: "额度无效" };

    const categoryKey =
      String(formData.get("categoryKey") ?? "").trim() ||
      item.categoryKey ||
      (item.kind === "TRAVEL" ? "transport" : "other");

    const primary = item.invoices[0];

    if (primary) {
      await prisma.expenseInvoice.update({
        where: { id: primary.id },
        data: { amount, categoryKey },
      });
    } else if (amount > 0) {
      const count = await prisma.expenseInvoice.count({ where: { claimId: item.claimId } });
      await prisma.expenseInvoice.create({
        data: {
          claimId: item.claimId,
          itemId,
          fileName: "手填额度（无发票）",
          mimeType: "application/x-manual-amount",
          sizeBytes: 0,
          storageKey: `manual://${itemId}`,
          categoryKey,
          amount,
          ocrAmount: null,
          costTarget: null,
          projectId: item.projectId || item.claim.projectId || null,
          sortOrder: count,
        },
      });
    }

    if (item.claim.status === "REJECTED") {
      await prisma.expenseClaim.update({
        where: { id: item.claimId },
        data: { status: "DRAFT" },
      });
    }
    await recalculateClaimTotal(item.claimId);
    revalidateExpense(item.claimId, item.projectId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存额度失败" };
  }
}

/** 仅审核人（或管理员）填写成本归属 */
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
    const claimRow = invoice.claim;
    const step = getClaimCurrentStep(claimRow);
    const stepIndex = getClaimCurrentStepIndex(claimRow);
    const canAllocate =
      Boolean(step) &&
      !step!.isFinalPayout &&
      userCanActOnFlowStep({
        step: step!,
        user: session.user,
        managerId: claimRow.managerId,
        isFirstActiveStep: stepIndex === 0,
      });
    if (!canAllocate) return { error: "仅当前审批人可填写成本归属" };

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
        projectId: costTarget === "PROJECT" ? projectId : invoice.projectId,
        costCategory,
        amount: Number.isFinite(amount) ? amount : invoice.amount,
      },
    });
    await recalculateClaimTotal(claimRow.id);
    revalidateExpense(claimRow.id, projectId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "保存失败" };
  }
}

export async function removeExpenseInvoice(invoiceId: string): Promise<ActionResult> {
  try {
    const invoice = await prisma.expenseInvoice.findUnique({
      where: { id: invoiceId },
      include: { claim: true },
    });
    if (!invoice) return { error: "发票不存在" };
    const loaded = await requireEditableClaim(invoice.claimId);
    if ("error" in loaded && loaded.error) return { error: loaded.error };
    if (!invoice.storageKey.startsWith("manual://")) {
      await deleteExpenseInvoiceFile(invoice.storageKey);
    }
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
    let managerIdRaw = String(formData.get("managerId") ?? "").trim();

    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: {
        invoices: true,
        trips: true,
        items: { include: { project: { select: { name: true } } } },
      },
    });
    if (!claim || claim.applicantId !== session.user.id) return { error: "无权提交" };
    if (claim.status !== "DRAFT" && claim.status !== "REJECTED") {
      return { error: "当前状态不可提交" };
    }
    if (claim.items.length === 0) return { error: "请至少添加一个报销项目" };

    if (claim.claimKind === "TRAVEL") {
      if (claim.trips.length === 0) {
        return { error: "差旅报销请先填写至少一段行程" };
      }
      for (const trip of claim.trips) {
        if (!trip.fromCity?.trim() || !trip.city?.trim()) {
          return { error: "请完善每段行程的出发地与到达地点" };
        }
      }
    }

    const itemsFull = await prisma.expenseClaimItem.findMany({
      where: { claimId },
      include: { invoices: true },
    });
    let hasPositive = false;
    for (const item of itemsFull) {
      const itemSum = item.invoices.reduce((s, inv) => s + Number(inv.amount ?? 0), 0);
      if (itemSum > 0) hasPositive = true;
      const hasRealFile = item.invoices.some(
        (inv) => inv.sizeBytes > 0 && !inv.storageKey.startsWith("manual://")
      );
      if (itemSum > 0 && !hasRealFile && !item.notes?.trim()) {
        return { error: "有未上传发票的额度，请在对应行备注中说明原因" };
      }
      for (const inv of item.invoices) {
        if (inv.amount == null || Number(inv.amount) < 0) {
          return { error: "存在金额无效的发票，请先完善" };
        }
      }
    }
    if (!hasPositive) return { error: "请至少填写一项大于 0 的额度" };

    let beneficiaryId =
      String(formData.get("beneficiaryId") ?? "").trim() || claim.beneficiaryId;
    if (!(await hasPermission(session.user.role, "expense.proxy_beneficiary"))) {
      beneficiaryId = session.user.id;
    }
    const beneficiary = await prisma.user.findUnique({
      where: { id: beneficiaryId },
      select: { id: true, role: true },
    });
    if (!beneficiary) return { error: "实际报销人不存在" };

    const flow = await getExpenseFlowSnapshotFromConfig();
    // 按实际报销人角色走流程映射（代填时与填单人角色可能不同）
    const built = buildSubmitFlowSnapshot(flow, {
      id: beneficiary.id,
      role: beneficiary.role,
    });
    if (!built.ok) return { error: built.error };
    const snapshot = built.snapshot;
    const firstStep = snapshot.activeSteps[0]!;

    let managerId: string | null = null;
    const needsPick = !firstStep.isFinalPayout;
    if (needsPick) {
      const candidates = approverCandidateFilter(firstStep);

      if (!managerIdRaw && candidates.userIds.length === 1 && candidates.roles.length === 0) {
        managerIdRaw = candidates.userIds[0]!;
      }

      if (!managerIdRaw) return { error: `请选择「${firstStep.name}」审批人` };
      if (managerIdRaw === session.user.id || managerIdRaw === beneficiary.id) {
        return { error: "不能指定自己或实际报销人为审批人" };
      }

      const manager = await prisma.user.findUnique({
        where: { id: managerIdRaw },
        select: { id: true, role: true },
      });
      if (!manager) return { error: "审批人不存在" };
      const ok = partyMatches(
        { roles: candidates.roles, userIds: candidates.userIds },
        manager
      );
      if (!ok) return { error: "所选审批人不在当前流程节点允许的范围内" };
      managerId = managerIdRaw;
    }

    const hotelCap = await evaluateHotelCapForInvoices({
      trips: claim.trips,
      invoices: claim.invoices.map((inv) => ({
        categoryKey: inv.categoryKey,
        amount: inv.amount != null ? Number(inv.amount) : null,
      })),
    });
    if (hotelCap.exceeded) {
      // 无行程城市等硬错误
      if (hotelCap.maxAllowed === 0 && hotelCap.segments.length === 0) {
        return { error: hotelCap.message ?? "请先完善行程到达地点" };
      }
      for (const item of itemsFull) {
        const catKey =
          item.categoryKey ||
          item.invoices[0]?.categoryKey ||
          (item.kind === "TRAVEL" ? "transport" : null);
        const fee = await getExpenseFeeCategoryByKey(catKey);
        if (!fee?.enforceHotelCap) continue;
        const itemSum = item.invoices.reduce((s, inv) => s + Number(inv.amount ?? 0), 0);
        if (itemSum <= 0) continue;
        if (!item.notes?.trim()) {
          return {
            error: "住宿费用超出标准，请在住宿行「备注」中说明超标原因后再提交",
          };
        }
      }
      if (String(formData.get("confirmOverHotelCap") ?? "").trim() !== "1") {
        return {
          needsConfirm: {
            kind: "hotel_cap_overage",
            message: `${hotelCap.message ?? "住宿超出标准"}。确认后仍可提交，审核人将看到超标提示。`,
          },
        };
      }
    }

    const descriptionRaw = formData.get("description");
    const description =
      descriptionRaw == null
        ? claim.description
        : String(descriptionRaw).trim() || null;
    const title = buildAutoExpenseTitle(claim.items);

    await recalculateClaimTotal(claimId);
    await prisma.expenseClaim.update({
      where: { id: claimId },
      data: {
        title,
        description,
        beneficiaryId,
        managerId,
        flowSnapshot: snapshot,
        currentStepIndex: 0,
        status: statusForActiveStep(firstStep, 0),
        submittedAt: new Date(),
        rejectedAt: null,
        rejectReason: null,
      },
    });
    revalidateExpense(claimId, claim.projectId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "提交失败" };
  }
}

async function advanceOrRejectExpenseStep(input: {
  claimId: string;
  actor: { id: string; role: string };
  action: "APPROVED" | "REJECTED";
  comment: string | null;
  /** 期望是否为打款结案步；中间步传 false，首步不限制 */
  expectFinal?: boolean;
  /** 期望是否为首个有效步 */
  expectFirst?: boolean;
}): Promise<ActionResult> {
  const claim = await prisma.expenseClaim.findUnique({
    where: { id: input.claimId },
    include: { invoices: true },
  });
  if (!claim) return { error: "报销单不存在" };
  if (!["PENDING_MANAGER", "PENDING_HR", "PENDING_PAYOUT"].includes(claim.status)) {
    return { error: "当前状态不可审批" };
  }

  const path = getClaimActivePath(claim);
  const stepIndex = getClaimCurrentStepIndex(claim);
  const step = getClaimCurrentStep(claim);
  if (!step || stepIndex < 0) return { error: "无法解析当前审批步骤" };

  if (input.expectFinal != null && step.isFinalPayout !== input.expectFinal) {
    return { error: "当前不在该审批环节" };
  }
  if (input.expectFirst === true && stepIndex !== 0) {
    return { error: "当前不在该审批环节" };
  }
  if (input.expectFirst === false && stepIndex === 0) {
    return { error: "当前不在该审批环节" };
  }

  if (
    !userCanActOnFlowStep({
      step,
      user: input.actor,
      managerId: claim.managerId,
      isFirstActiveStep: stepIndex === 0,
    })
  ) {
    return { error: "无权审批此步骤" };
  }

  if (input.action === "APPROVED") {
    assertInvoicesReadyForManagerApproval(claim.invoices);
  }

  const recordStep = approvalRecordStepForFlow(step, stepIndex);
  const reason =
    input.comment?.trim() ||
    (input.action === "REJECTED" ? `${step.name}驳回` : null);

  if (input.action === "REJECTED") {
    await prisma.$transaction(async (tx) => {
      await tx.expenseApproval.create({
        data: {
          claimId: claim.id,
          step: recordStep,
          action: "REJECTED",
          actorId: input.actor.id,
          comment: reason,
        },
      });
      await tx.expenseClaim.update({
        where: { id: claim.id },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectReason: reason,
        },
      });
    });
    revalidateExpense(claim.id, claim.projectId);
    return {};
  }

  const nextIndex = stepIndex + 1;
  const nextStep = path[nextIndex];

  if (step.isFinalPayout || !nextStep) {
    return { error: "请使用打款结案完成最后一步" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.expenseApproval.create({
      data: {
        claimId: claim.id,
        step: recordStep,
        action: "APPROVED",
        actorId: input.actor.id,
        comment: reason,
      },
    });
    await tx.expenseClaim.update({
      where: { id: claim.id },
      data: {
        currentStepIndex: nextIndex,
        status: statusForActiveStep(nextStep, nextIndex),
        ...(claim.flowSnapshot == null
          ? { flowSnapshot: resolveClaimFlowSnapshot(claim) }
          : {}),
      },
    });
  });
  revalidateExpense(claim.id, claim.projectId);
  return {};
}

export async function approveExpenseByManager(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const comment = String(formData.get("comment") ?? "").trim() || null;
    return advanceOrRejectExpenseStep({
      claimId,
      actor: session.user,
      action: "APPROVED",
      comment,
      expectFirst: true,
      expectFinal: false,
    });
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
    const comment = String(formData.get("comment") ?? "").trim() || null;
    return advanceOrRejectExpenseStep({
      claimId,
      actor: session.user,
      action: "REJECTED",
      comment,
      expectFirst: true,
      expectFinal: false,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "驳回失败" };
  }
}

export async function approveExpenseByHr(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const comment = String(formData.get("comment") ?? "").trim() || null;
    return advanceOrRejectExpenseStep({
      claimId,
      actor: session.user,
      action: "APPROVED",
      comment,
      expectFirst: false,
      expectFinal: false,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "确认失败" };
  }
}

export async function rejectExpenseByHr(
  claimId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const comment = String(formData.get("comment") ?? "").trim() || null;
    return advanceOrRejectExpenseStep({
      claimId,
      actor: session.user,
      action: "REJECTED",
      comment,
      expectFirst: false,
      expectFinal: false,
    });
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
    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      include: { invoices: true },
    });
    if (!claim) return { error: "报销单不存在" };
    if (claim.status !== "PENDING_PAYOUT") return { error: "不在待打款状态" };

    const step = getClaimCurrentStep(claim);
    const stepIndex = getClaimCurrentStepIndex(claim);
    if (!step?.isFinalPayout) return { error: "当前不在打款结案步骤" };
    if (
      !userCanActOnFlowStep({
        step,
        user: session.user,
        managerId: claim.managerId,
        isFirstActiveStep: stepIndex === 0,
      })
    ) {
      return { error: "无权打款结案" };
    }

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
          step: approvalRecordStepForFlow(step, stepIndex),
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
        beneficiaryId: claim.beneficiaryId,
        recordedById: session.user.id,
        tx,
      });
      await tx.expenseClaim.update({
        where: { id: claimId },
        data: { status: "PAID", paidAt, currentStepIndex: null },
      });
    });

    await notifyExpensePaid({
      applicantId: claim.applicantId,
      beneficiaryId: claim.beneficiaryId,
      claimId,
      title: claim.title,
      amount,
    });
    revalidateExpense(claimId, claim.projectId);
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
      if (!inv.storageKey.startsWith("manual://")) {
        await deleteExpenseInvoiceFile(inv.storageKey);
      }
    }
    await prisma.expenseClaim.delete({ where: { id: claimId } });
    revalidateExpense(undefined, claim.projectId);
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
  if (!claim || !(await canViewClaim(claim, session.user))) {
    redirect("/expenses");
  }
  return { session, claim };
}
