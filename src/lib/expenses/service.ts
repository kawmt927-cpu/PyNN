import type {
  ExpenseCostTarget,
  Prisma,
  SalesCostType,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getExpenseCategoryRule } from "@/lib/expenses/labels";
import { createAppNotification } from "@/lib/notifications/app-notifications";
import { deleteExpenseInvoiceFile } from "@/lib/expenses/attachments";

export const claimInclude = {
  applicant: { select: { id: true, name: true, role: true } },
  beneficiary: { select: { id: true, name: true, role: true } },
  manager: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  items: {
    include: {
      customer: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      trips: {
        include: { customer: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: "asc" as const }, { startDate: "asc" as const }],
      },
      invoices: {
        include: {
          customer: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          postedSalesCost: { select: { id: true } },
          postedProjectCost: { select: { id: true } },
        },
        orderBy: { sortOrder: "asc" as const },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  trips: {
    include: { customer: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: "asc" as const }, { startDate: "asc" as const }],
  },
  invoices: {
    include: {
      customer: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      postedSalesCost: { select: { id: true } },
      postedProjectCost: { select: { id: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  approvals: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  payout: true,
} satisfies Prisma.ExpenseClaimInclude;

export async function recalculateClaimTotal(claimId: string, tx: Prisma.TransactionClient = prisma) {
  const invoices = await tx.expenseInvoice.findMany({
    where: { claimId },
    select: { amount: true },
  });
  const total = invoices.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  await tx.expenseClaim.update({
    where: { id: claimId },
    data: { totalAmount: total },
  });
  return total;
}

export function validateInvoiceAllocation(input: {
  costTarget: ExpenseCostTarget | null | undefined;
  salesCostType?: SalesCostType | null;
  projectId?: string | null;
  categoryKey?: string | null;
  amount?: number | null;
}) {
  if (input.amount == null || !(input.amount > 0)) {
    return "发票金额无效";
  }
  if (!input.costTarget) {
    return "请指定成本归属";
  }
  const rule = getExpenseCategoryRule(input.categoryKey);
  if (input.costTarget === "PROJECT") {
    if (!input.projectId) return "项目成本必须选择项目";
  }
  if (input.costTarget === "SALES") {
    if (!input.salesCostType) return "销售成本必须选择类型";
  }
  if (rule?.requireProject && input.costTarget === "PROJECT" && !input.projectId) {
    return "该费用类别必须选择项目";
  }
  return null;
}

/** 上级通过前：每张发票归属合法 */
export function assertInvoicesReadyForManagerApproval(
  invoices: Array<{
    amount: unknown;
    costTarget: ExpenseCostTarget | null;
    salesCostType: SalesCostType | null;
    projectId: string | null;
    categoryKey: string | null;
  }>
) {
  if (invoices.length === 0) throw new Error("请至少上传一张发票");
  for (const [index, inv] of invoices.entries()) {
    const err = validateInvoiceAllocation({
      costTarget: inv.costTarget,
      salesCostType: inv.salesCostType,
      projectId: inv.projectId,
      categoryKey: inv.categoryKey,
      amount: inv.amount != null ? Number(inv.amount) : null,
    });
    if (err) throw new Error(`第 ${index + 1} 张发票：${err}`);
  }
}

export async function postInvoiceCosts(input: {
  claimId: string;
  /** 实际报销人：销售成本挂此人 */
  beneficiaryId: string;
  recordedById: string;
  tx: Prisma.TransactionClient;
}) {
  const invoices = await input.tx.expenseInvoice.findMany({
    where: { claimId: input.claimId },
    orderBy: { sortOrder: "asc" },
  });

  for (const inv of invoices) {
    if (inv.postedSalesCostId || inv.postedProjectCostId) continue;
    const amount = Number(inv.amount ?? 0);
    if (!(amount > 0) || !inv.costTarget || inv.costTarget === "NONE") continue;

    const costDate = inv.invoicedAt ?? new Date();
    const descParts = [
      `报销入账`,
      inv.invoiceNo ? `票号 ${inv.invoiceNo}` : null,
      inv.sellerName,
      inv.costCategory,
      inv.ocrNotes,
    ].filter(Boolean);

    if (inv.costTarget === "SALES") {
      const salesCostType = inv.salesCostType ?? "PERSONAL_TRAVEL";
      const created = await input.tx.salesCost.create({
        data: {
          salesUserId: input.beneficiaryId,
          recordedById: input.recordedById,
          costType: salesCostType,
          totalAmount: amount,
          costDate,
          customerId: inv.customerId || undefined,
          presalesUserId: inv.presalesUserId || undefined,
          otherTravel: salesCostType === "PERSONAL_TRAVEL" ? amount : undefined,
          description: descParts.join(" · "),
        },
      });
      await input.tx.expenseInvoice.update({
        where: { id: inv.id },
        data: { postedSalesCostId: created.id },
      });
    } else if (inv.costTarget === "PROJECT") {
      if (!inv.projectId) throw new Error("项目成本发票缺少项目");
      const created = await input.tx.projectCost.create({
        data: {
          projectId: inv.projectId,
          recordedById: input.recordedById,
          category: inv.costCategory?.trim() || "报销",
          amount,
          costDate,
          description: descParts.join(" · "),
        },
      });
      await input.tx.expenseInvoice.update({
        where: { id: inv.id },
        data: { postedProjectCostId: created.id },
      });
    }
  }
}

export async function notifyExpensePaid(input: {
  applicantId: string;
  beneficiaryId: string;
  claimId: string;
  title: string;
  amount: number;
}) {
  const recipients = [...new Set([input.applicantId, input.beneficiaryId])];
  await createAppNotification({
    type: "EXPENSE_CLAIM_PAID",
    title: "报销已打款结案",
    body: `报销单「${input.title}」已打款结案，金额 ¥${input.amount.toFixed(2)}。`,
    linkHref: `/expenses/${input.claimId}`,
    recipientUserIds: recipients,
    pushWeCom: true,
    meta: { claimId: input.claimId, action: "expense_paid" },
  });
}

export async function deleteClaimCascadeFiles(claimId: string) {
  const invoices = await prisma.expenseInvoice.findMany({
    where: { claimId },
    select: { storageKey: true },
  });
  for (const inv of invoices) {
    await deleteExpenseInvoiceFile(inv.storageKey);
  }
}

export async function canViewClaim(
  claim: {
    applicantId: string;
    beneficiaryId: string;
    managerId: string | null;
    status: string;
    flowSnapshot?: unknown;
    currentStepIndex?: number | null;
  },
  user: { id: string; role: UserRole }
) {
  if (user.role === "ADMIN") return true;
  if (claim.applicantId === user.id) return true;
  if (claim.beneficiaryId === user.id) return true;
  if (claim.managerId === user.id) return true;

  if (["PENDING_MANAGER", "PENDING_HR", "PENDING_PAYOUT", "PAID"].includes(claim.status)) {
    if (claim.status === "PAID") {
      const { partyMatches, resolveClaimFlowSnapshot } = await import(
        "@/lib/expenses/approval-flow"
      );
      const snap = resolveClaimFlowSnapshot(claim);
      for (const step of snap.steps) {
        for (const m of step.mappings) {
          if (m.approvers.skip) continue;
          if (
            partyMatches(
              { roles: m.approvers.roles, userIds: m.approvers.userIds },
              user
            )
          ) {
            return true;
          }
        }
      }
      return false;
    }
    const {
      getClaimCurrentStep,
      getClaimCurrentStepIndex,
      userCanActOnFlowStep,
    } = await import("@/lib/expenses/approval-flow");
    const step = getClaimCurrentStep(claim);
    const stepIndex = getClaimCurrentStepIndex(claim);
    if (
      step &&
      userCanActOnFlowStep({
        step,
        user,
        managerId: claim.managerId,
        allowAdminBypass: false,
        isFirstActiveStep: stepIndex === 0,
      })
    ) {
      return true;
    }
  }
  return false;
}

export function canEditClaimDraft(
  claim: { applicantId: string; status: string },
  user: { id: string; role: UserRole }
) {
  if (claim.status !== "DRAFT" && claim.status !== "REJECTED") return false;
  return claim.applicantId === user.id || user.role === "ADMIN";
}
