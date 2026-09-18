import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerClaimApprovalList } from "@/components/approvals/customer-claim-approval-list";
import { ContractApprovalList } from "@/components/approvals/contract-approval-list";
import { ExpenseApprovalList } from "@/components/approvals/expense-approval-list";
import { FollowUpConfirmApprovalList } from "@/components/approvals/follow-up-confirm-approval-list";
import {
  APPROVAL_TYPE,
  APPROVAL_TYPE_LABELS,
  normalizeApprovalType,
  pickDefaultApprovalType,
} from "@/lib/approvals/constants";
import { pendingContractApprovalFilter } from "@/lib/contracts/approval";
import { approveContract, rejectContract } from "@/app/(dashboard)/contracts/actions";
import { ALL_AUTHED_ROLES } from "@/lib/expenses/labels";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import {
  getClaimCurrentStep,
  userCanActOnFlowStep,
} from "@/lib/expenses/approval-flow";
import { CONFIG_CATEGORY, getConfigOptions } from "@/lib/config-options";
import { cn } from "@/lib/utils";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

type Props = {
  searchParams: Promise<{ tab?: string; type?: string; customerId?: string }>;
};

export default async function ApprovalsPage({ searchParams }: Props) {
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  const { tab: rawTab, type: rawType, customerId } = await searchParams;
  const tab = rawTab === "done" ? "done" : "pending";
  const canSalesApprovals =
    hasPermissionSync(session.user.role, "approvals.sales");
  const expenseOn = isExpenseFeatureEnabled();

  const db = prisma;
  // 报销待办：先取三类在途，再按流程配置判定当前用户是否可审
  const expensePendingWhere = {
    status: {
      in: ["PENDING_MANAGER", "PENDING_HR", "PENDING_PAYOUT"] as Array<
        "PENDING_MANAGER" | "PENDING_HR" | "PENDING_PAYOUT"
      >,
    },
  };

  const [pendingClaimCount, pendingContractCount, pendingFollowUpCount, pendingExpenseRowsForCount] =
    await Promise.all([
      canSalesApprovals
        ? db.customerClaimRequest.count({ where: { status: "PENDING" } })
        : Promise.resolve(0),
      canSalesApprovals
        ? db.contract.count({ where: pendingContractApprovalFilter() })
        : Promise.resolve(0),
      canSalesApprovals
        ? db.followUp.count({ where: { confirmStatus: "PENDING_MANAGER" } })
        : Promise.resolve(0),
      expenseOn
        ? db.expenseClaim.findMany({
            where: expensePendingWhere,
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

  const pendingExpenseCount = pendingExpenseRowsForCount.filter((c) => {
    const step = getClaimCurrentStep(c);
    return (
      step &&
      userCanActOnFlowStep({
        step,
        user: session.user,
        managerId: c.managerId,
      })
    );
  }).length;

  // 未指定 type：自动跳到首个有待办的卡片；都没有则第一个
  if (!rawType) {
    const landingType = pickDefaultApprovalType({
      canSalesApprovals,
      expenseOn,
      pendingCounts: {
        [APPROVAL_TYPE.CUSTOMER_CLAIM]: pendingClaimCount,
        [APPROVAL_TYPE.CONTRACT]: pendingContractCount,
        [APPROVAL_TYPE.FOLLOW_UP_CONFIRM]: pendingFollowUpCount,
        [APPROVAL_TYPE.EXPENSE]: pendingExpenseCount,
      },
    });
    const params = new URLSearchParams();
    params.set("type", landingType);
    if (tab === "done") params.set("tab", "done");
    if (customerId) params.set("customerId", customerId);
    redirect(`/approvals?${params.toString()}`);
  }

  const normalizedRaw = normalizeApprovalType(rawType) ?? APPROVAL_TYPE.CUSTOMER_CLAIM;
  const type =
    normalizedRaw === APPROVAL_TYPE.CONTRACT && canSalesApprovals
      ? APPROVAL_TYPE.CONTRACT
      : normalizedRaw === APPROVAL_TYPE.FOLLOW_UP_CONFIRM && canSalesApprovals
        ? APPROVAL_TYPE.FOLLOW_UP_CONFIRM
        : normalizedRaw === APPROVAL_TYPE.CUSTOMER_CLAIM && canSalesApprovals
          ? APPROVAL_TYPE.CUSTOMER_CLAIM
          : expenseOn && (normalizedRaw === APPROVAL_TYPE.EXPENSE || !canSalesApprovals)
            ? APPROVAL_TYPE.EXPENSE
            : canSalesApprovals
              ? APPROVAL_TYPE.CUSTOMER_CLAIM
              : APPROVAL_TYPE.EXPENSE;

  const followUpInclude = {
    user: { select: { id: true, name: true } },
    confirmedBy: { select: { name: true } },
    customer: { select: { id: true, name: true } },
    opportunity: {
      select: {
        id: true,
        title: true,
        confirmStatus: true,
        stage: true,
        expectedAmount: true,
        expectedCloseDate: true,
        grade: true,
      },
    },
    contact: {
      select: {
        id: true,
        name: true,
        title: true,
        phone: true,
        wechat: true,
        role: true,
        confirmStatus: true,
      },
    },
    linkedContacts: {
      select: {
        contact: {
          select: {
            id: true,
            name: true,
            title: true,
            phone: true,
            wechat: true,
            role: true,
            confirmStatus: true,
          },
        },
      },
    },
    linkedOpportunities: {
      select: {
        opportunity: {
          select: {
            id: true,
            title: true,
            confirmStatus: true,
            stage: true,
            expectedAmount: true,
            expectedCloseDate: true,
            grade: true,
          },
        },
      },
    },
  } as const;

  type FollowUpApprovalRow = Awaited<
    ReturnType<
      typeof db.followUp.findMany<{ include: typeof followUpInclude }>
    >
  >[number];

  function withProxyBundle(row: FollowUpApprovalRow) {
    const pendingContacts = [
      ...(row.contact?.confirmStatus === "PENDING_MANAGER" ? [row.contact] : []),
      ...row.linkedContacts
        .map((x) => x.contact)
        .filter((c) => c.confirmStatus === "PENDING_MANAGER"),
    ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
    const pendingOpportunities = [
      ...(row.opportunity?.confirmStatus === "PENDING_MANAGER" ? [row.opportunity] : []),
      ...row.linkedOpportunities
        .map((x) => x.opportunity)
        .filter((o) => o.confirmStatus === "PENDING_MANAGER"),
    ].filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i);
    return { ...row, pendingContacts, pendingOpportunities };
  }

  const emptyFollowUps: FollowUpApprovalRow[] = [];

  const [
    pendingClaims,
    recentClaims,
    pendingContracts,
    recentContracts,
    pendingFollowUpsRaw,
    recentFollowUpsRaw,
    pendingExpenses,
    recentExpenses,
  ] = await Promise.all([
    type === APPROVAL_TYPE.CUSTOMER_CLAIM && canSalesApprovals
      ? db.customerClaimRequest.findMany({
          where: {
            status: "PENDING",
            ...(customerId ? { customerId } : {}),
          },
          include: {
            customer: { select: { id: true, name: true } },
            requester: { select: { id: true, name: true } },
            reviewer: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    type === APPROVAL_TYPE.CUSTOMER_CLAIM && canSalesApprovals
      ? db.customerClaimRequest.findMany({
          where: {
            status: { not: "PENDING" },
            ...(customerId ? { customerId } : {}),
          },
          include: {
            customer: { select: { id: true, name: true } },
            requester: { select: { id: true, name: true } },
            reviewer: { select: { name: true } },
          },
          orderBy: { reviewedAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
    type === APPROVAL_TYPE.CONTRACT && canSalesApprovals
      ? db.contract.findMany({
          where: pendingContractApprovalFilter(),
          include: {
            owner: { select: { name: true } },
            signCustomer: { select: { name: true } },
            submittedBy: { select: { name: true } },
          },
          orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    type === APPROVAL_TYPE.CONTRACT && canSalesApprovals
      ? db.contract.findMany({
          where: {
            status: { in: ["SIGNED_PENDING_IMPL", "REJECTED"] },
            OR: [{ approvedAt: { not: null } }, { rejectedAt: { not: null } }],
          },
          include: {
            owner: { select: { name: true } },
            signCustomer: { select: { name: true } },
            submittedBy: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
    type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM && canSalesApprovals
      ? db.followUp.findMany({
          where: {
            confirmStatus: "PENDING_MANAGER",
            ...(customerId ? { customerId } : {}),
          },
          include: followUpInclude,
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve(emptyFollowUps),
    type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM && canSalesApprovals
      ? db.followUp.findMany({
          where: {
            confirmedAt: { not: null },
            confirmedById: { not: null },
            ...(customerId ? { customerId } : {}),
            OR: [{ confirmStatus: "REJECTED" }, { confirmStatus: "CONFIRMED" }],
          },
          include: followUpInclude,
          orderBy: { confirmedAt: "desc" },
          take: 40,
        })
      : Promise.resolve(emptyFollowUps),
    type === APPROVAL_TYPE.EXPENSE && expenseOn
      ? db.expenseClaim.findMany({
          where: expensePendingWhere,
          include: {
            applicant: { select: { name: true } },
            manager: { select: { name: true } },
          },
          orderBy: { submittedAt: "asc" },
          take: 80,
        })
      : Promise.resolve([]),
    type === APPROVAL_TYPE.EXPENSE && expenseOn
      ? db.expenseClaim.findMany({
          where: {
            status: { in: ["REJECTED", "PENDING_HR", "PENDING_PAYOUT", "PAID"] },
            OR: [
              { managerId: session.user.id },
              { approvals: { some: { actorId: session.user.id } } },
            ],
          },
          include: {
            applicant: { select: { name: true } },
            manager: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
  ]);

  const pendingExpensesFiltered = pendingExpenses.filter((c) => {
    const step = getClaimCurrentStep(c);
    return (
      step &&
      userCanActOnFlowStep({
        step,
        user: session.user,
        managerId: c.managerId,
      })
    );
  });

  const pendingFollowUps = pendingFollowUpsRaw.map(withProxyBundle);
  // 已处理：管理确认/驳回（确认人≠作者，或已驳回）
  const recentFollowUpsFiltered = recentFollowUpsRaw
    .filter(
      (row) =>
        row.confirmStatus === "REJECTED" ||
        (row.confirmedById != null && row.confirmedById !== row.userId)
    )
    .map(withProxyBundle);

  const stageLabels =
    type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM && canSalesApprovals
      ? Object.fromEntries(
          (await getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE)).map((item) => [
            item.value,
            item.label,
          ])
        )
      : {};

  function toApprovalItems(
    rows: ReturnType<typeof withProxyBundle>[]
  ) {
    return rows.map((row) => ({
      ...row,
      pendingOpportunities: row.pendingOpportunities.map((o) => ({
        ...o,
        expectedAmount: Number(o.expectedAmount),
      })),
    }));
  }

  const pendingCount =
    type === APPROVAL_TYPE.CONTRACT
      ? pendingContracts.length
      : type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM
        ? pendingFollowUps.length
        : type === APPROVAL_TYPE.EXPENSE
          ? pendingExpensesFiltered.length
          : pendingClaims.length;

  const typeQuery = (nextType: string) => {
    const params = new URLSearchParams();
    params.set("type", nextType);
    if (tab === "done") params.set("tab", "done");
    if (customerId) params.set("customerId", customerId);
    return `/approvals?${params.toString()}`;
  };

  const tabQuery = (nextTab: "pending" | "done") => {
    const params = new URLSearchParams();
    params.set("type", type);
    if (nextTab === "done") params.set("tab", "done");
    if (customerId) params.set("customerId", customerId);
    return `/approvals?${params.toString()}`;
  };

  const salesTypeLabels = [
    APPROVAL_TYPE_LABELS.CUSTOMER_CLAIM,
    APPROVAL_TYPE_LABELS.CONTRACT,
    APPROVAL_TYPE_LABELS.FOLLOW_UP_CONFIRM,
    ...(expenseOn ? [APPROVAL_TYPE_LABELS.EXPENSE] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审批</h1>
        <p className="text-muted-foreground">
          统一处理各类待办审批：
          {canSalesApprovals ? salesTypeLabels.join("、") : APPROVAL_TYPE_LABELS.EXPENSE}
          {canSalesApprovals
            ? "。非本人客户确认会一次性处理同次提交的往来、联系人与商机。"
            : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canSalesApprovals ? (
          <>
            <TypeLink
              href={typeQuery(APPROVAL_TYPE.CUSTOMER_CLAIM)}
              active={type === APPROVAL_TYPE.CUSTOMER_CLAIM}
              label={`${APPROVAL_TYPE_LABELS.CUSTOMER_CLAIM} (${pendingClaimCount})`}
            />
            <TypeLink
              href={typeQuery(APPROVAL_TYPE.CONTRACT)}
              active={type === APPROVAL_TYPE.CONTRACT}
              label={`${APPROVAL_TYPE_LABELS.CONTRACT} (${pendingContractCount})`}
            />
            <TypeLink
              href={typeQuery(APPROVAL_TYPE.FOLLOW_UP_CONFIRM)}
              active={type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM}
              label={`${APPROVAL_TYPE_LABELS.FOLLOW_UP_CONFIRM} (${pendingFollowUpCount})`}
            />
          </>
        ) : null}
        {expenseOn ? (
          <TypeLink
            href={typeQuery(APPROVAL_TYPE.EXPENSE)}
            active={type === APPROVAL_TYPE.EXPENSE}
            label={`${APPROVAL_TYPE_LABELS.EXPENSE} (${pendingExpenseCount})`}
          />
        ) : null}
      </div>

      {customerId &&
        (type === APPROVAL_TYPE.CUSTOMER_CLAIM || type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM) && (
          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
            正在筛选指定客户的审批记录。
            <Link href={typeQuery(type)} className="ml-2 text-primary hover:underline">
              查看全部
            </Link>
          </div>
        )}

      <div className="flex gap-2 border-b">
        <TabLink href={tabQuery("pending")} active={tab === "pending"} label={`待审批 (${pendingCount})`} />
        <TabLink href={tabQuery("done")} active={tab === "done"} label="已处理" />
      </div>

      {tab === "pending" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">待审批</CardTitle>
          </CardHeader>
          <CardContent>
            {type === APPROVAL_TYPE.CONTRACT ? (
              <ContractApprovalList
                showActions
                onApprove={approveContract}
                onReject={rejectContract}
                items={pendingContracts.map((row) => ({
                  id: row.id,
                  title: row.title,
                  contractNo: row.contractNo,
                  totalAmount: Number(row.totalAmount),
                  submittedAt: row.submittedAt?.toISOString() ?? null,
                  signedAt: row.signedAt?.toISOString() ?? null,
                  owner: row.owner,
                  signCustomer: row.signCustomer,
                  submittedBy: row.submittedBy,
                }))}
              />
            ) : type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM ? (
              <FollowUpConfirmApprovalList
                items={toApprovalItems(pendingFollowUps)}
                showActions
                stageLabels={stageLabels}
              />
            ) : type === APPROVAL_TYPE.EXPENSE ? (
              <ExpenseApprovalList
                items={pendingExpensesFiltered.map((row) => ({
                  id: row.id,
                  title: row.title,
                  status: row.status,
                  totalAmount: Number(row.totalAmount),
                  submittedAt: row.submittedAt,
                  applicant: row.applicant,
                  manager: row.manager,
                }))}
              />
            ) : (
              <CustomerClaimApprovalList items={pendingClaims} showActions />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">已处理</CardTitle>
          </CardHeader>
          <CardContent>
            {type === APPROVAL_TYPE.CONTRACT ? (
              <ContractApprovalList
                items={recentContracts.map((row) => ({
                  id: row.id,
                  title: row.title,
                  contractNo: row.contractNo,
                  totalAmount: Number(row.totalAmount),
                  submittedAt: row.submittedAt?.toISOString() ?? null,
                  signedAt: row.signedAt?.toISOString() ?? null,
                  owner: row.owner,
                  signCustomer: row.signCustomer,
                  submittedBy: row.submittedBy,
                }))}
              />
            ) : type === APPROVAL_TYPE.FOLLOW_UP_CONFIRM ? (
              <FollowUpConfirmApprovalList
                items={toApprovalItems(recentFollowUpsFiltered)}
                stageLabels={stageLabels}
              />
            ) : type === APPROVAL_TYPE.EXPENSE ? (
              <ExpenseApprovalList
                items={recentExpenses.map((row) => ({
                  id: row.id,
                  title: row.title,
                  status: row.status,
                  totalAmount: Number(row.totalAmount),
                  submittedAt: row.submittedAt,
                  paidAt: row.paidAt,
                  applicant: row.applicant,
                  manager: row.manager,
                }))}
              />
            ) : (
              <CustomerClaimApprovalList items={recentClaims} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

function TypeLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}
