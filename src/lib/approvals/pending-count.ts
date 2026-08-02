import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pendingContractApprovalFilter } from "@/lib/contracts/approval";
import { canFinanceExpense } from "@/lib/expenses/labels";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";

/** 审批中心待处理总数：客户认领 + 合同审核 + 本人相关报销 */
export async function countPendingApprovals(user?: { id: string; role: UserRole }) {
  const canSeeSalesApprovals =
    !user || user.role === "SALES_MANAGER" || user.role === "ADMIN";
  const expenseOn = isExpenseFeatureEnabled();

  const [claims, contracts, managerExpenses, payoutExpenses] = await Promise.all([
    canSeeSalesApprovals
      ? prisma.customerClaimRequest.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    canSeeSalesApprovals
      ? prisma.contract.count({ where: pendingContractApprovalFilter() })
      : Promise.resolve(0),
    expenseOn && user
      ? user.role === "ADMIN"
        ? prisma.expenseClaim.count({ where: { status: "PENDING_MANAGER" } })
        : prisma.expenseClaim.count({
            where: { managerId: user.id, status: "PENDING_MANAGER" },
          })
      : Promise.resolve(0),
    expenseOn && user && canFinanceExpense(user.role)
      ? prisma.expenseClaim.count({ where: { status: "PENDING_PAYOUT" } })
      : Promise.resolve(0),
  ]);

  return claims + contracts + managerExpenses + payoutExpenses;
}
