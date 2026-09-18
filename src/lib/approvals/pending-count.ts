import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pendingContractApprovalFilter } from "@/lib/contracts/approval";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import {
  getClaimCurrentStep,
  userCanActOnFlowStep,
} from "@/lib/expenses/approval-flow";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 审批中心待处理总数：客户认领 + 合同审核 + 本人相关报销 */
export async function countPendingApprovals(user?: { id: string; role: UserRole }) {
  const canSeeSalesApprovals =
    !user || hasPermissionSync(user.role, "approvals.sales");
  const expenseOn = isExpenseFeatureEnabled();

  const [claims, contracts, followUps, managerExpenses, midAndFinal] =
    await Promise.all([
      canSeeSalesApprovals
        ? prisma.customerClaimRequest.count({ where: { status: "PENDING" } })
        : Promise.resolve(0),
      canSeeSalesApprovals
        ? prisma.contract.count({ where: pendingContractApprovalFilter() })
        : Promise.resolve(0),
      canSeeSalesApprovals
        ? prisma.followUp.count({ where: { confirmStatus: "PENDING_MANAGER" } })
        : Promise.resolve(0),
      expenseOn && user
        ? user.role === "ADMIN"
          ? prisma.expenseClaim.count({ where: { status: "PENDING_MANAGER" } })
          : prisma.expenseClaim.count({
              where: { managerId: user.id, status: "PENDING_MANAGER" },
            })
        : Promise.resolve(0),
      expenseOn && user
        ? prisma.expenseClaim.findMany({
            where: { status: { in: ["PENDING_HR", "PENDING_PAYOUT"] } },
            select: {
              id: true,
              status: true,
              managerId: true,
              flowSnapshot: true,
              currentStepIndex: true,
            },
            take: 200,
          })
        : Promise.resolve([]),
    ]);

  let hrAndPayout = 0;
  if (user && Array.isArray(midAndFinal)) {
    for (const c of midAndFinal) {
      const step = getClaimCurrentStep(c);
      if (
        step &&
        userCanActOnFlowStep({
          step,
          user,
          managerId: c.managerId,
        })
      ) {
        hrAndPayout += 1;
      }
    }
  }

  return claims + contracts + followUps + managerExpenses + hrAndPayout;
}
