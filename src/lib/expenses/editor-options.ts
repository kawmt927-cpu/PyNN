import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimInclude } from "@/lib/expenses/service";
import {
  approverCandidateFilter,
  getExpenseFlowSnapshotFromConfig,
  resolveActiveStepsForApplicant,
} from "@/lib/expenses/approval-flow";
import { hasPermission } from "@/lib/rbac/has-permission";

export type ExpenseClaimWithInclude = Prisma.ExpenseClaimGetPayload<{
  include: typeof claimInclude;
}>;

export type ExpenseEditorCapability = {
  canProxyBeneficiary: boolean;
  requiresSuperiorPick: boolean;
  superiorStepName: string | null;
};

export type ExpenseApproverOptions = {
  managers: Array<{ id: string; name: string }>;
  requiresSuperiorPick: boolean;
  superiorStepName: string | null;
};

/**
 * 按「实际报销人」解析流程首个需指定审批人的节点，候选人仅限该映射的审批人配置。
 */
export async function loadExpenseApproverOptionsForApplicant(
  applicant: { id: string; role: UserRole | string },
  excludeUserIds: string[] = []
): Promise<ExpenseApproverOptions> {
  const flow = await getExpenseFlowSnapshotFromConfig();
  const resolved = resolveActiveStepsForApplicant(flow.steps, applicant);
  const active = resolved.ok ? resolved.steps : [];
  const firstStep = active[0] ?? null;
  const requiresSuperiorPick = Boolean(firstStep && !firstStep.isFinalPayout);
  const filter = firstStep ? approverCandidateFilter(firstStep) : { roles: [], userIds: [] };

  const enabledUserWhere = {
    OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
  };
  const exclude = [...new Set(excludeUserIds.filter(Boolean))];

  let managers: Array<{ id: string; name: string }> = [];
  if (requiresSuperiorPick && firstStep) {
    if (filter.roles.length > 0 || filter.userIds.length > 0) {
      managers = await prisma.user.findMany({
        where: {
          ...enabledUserWhere,
          ...(exclude.length > 0 ? { id: { notIn: exclude } } : {}),
          OR: [
            ...(filter.roles.length > 0 ? [{ role: { in: filter.roles } }] : []),
            ...(filter.userIds.length > 0 ? [{ id: { in: filter.userIds } }] : []),
          ],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 300,
      });
    }
  }

  return {
    managers,
    requiresSuperiorPick,
    superiorStepName: firstStep?.name ?? null,
  };
}

export async function loadExpenseEditorOptions(
  actorRole: UserRole | string,
  actorUserId?: string,
  applicant?: { id: string; role: UserRole | string }
) {
  const canProxyBeneficiary = await hasPermission(
    actorRole,
    "expense.proxy_beneficiary"
  );

  const resolvedApplicant = applicant ?? {
    id: actorUserId ?? "",
    role: actorRole,
  };

  const excludeIds = [actorUserId, resolvedApplicant.id].filter(
    (id): id is string => Boolean(id)
  );

  const approverOptions = await loadExpenseApproverOptionsForApplicant(
    resolvedApplicant,
    excludeIds
  );

  const enabledUserWhere = {
    OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
  };

  const [beneficiaries, projects, customers] = await Promise.all([
    canProxyBeneficiary
      ? prisma.user.findMany({
          where: enabledUserWhere,
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 300,
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return {
    managers: approverOptions.managers,
    beneficiaries,
    projects,
    customers,
    capability: {
      canProxyBeneficiary,
      requiresSuperiorPick: approverOptions.requiresSuperiorPick,
      superiorStepName: approverOptions.superiorStepName,
    } satisfies ExpenseEditorCapability,
  };
}

export function expenseEditorClaimProps(claim: ExpenseClaimWithInclude) {
  return {
    claimId: claim.id,
    claimKind: claim.claimKind,
    initialTitle: claim.title,
    initialDescription: claim.description,
    initialBeneficiaryId: claim.beneficiaryId,
    initialProjectId: claim.projectId,
    applicantName: claim.applicant.name,
    items: claim.items,
    trips: claim.trips,
    currentManagerId: claim.managerId,
  };
}
