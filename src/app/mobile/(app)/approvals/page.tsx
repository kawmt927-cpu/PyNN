import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MOBILE_MANAGER_ROLES } from "@/lib/mobile/sales-roles";
import { CustomerClaimApprovalList } from "@/components/approvals/customer-claim-approval-list";
import { ContractApprovalList } from "@/components/approvals/contract-approval-list";
import { FollowUpConfirmApprovalList } from "@/components/approvals/follow-up-confirm-approval-list";
import { ExpenseApprovalList } from "@/components/approvals/expense-approval-list";
import { pendingContractApprovalFilter } from "@/lib/contracts/approval";
import { approveContract, rejectContract } from "@/app/(dashboard)/contracts/actions";
import { CONFIG_CATEGORY, getConfigOptions } from "@/lib/config-options";
import { cn } from "@/lib/utils";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import {
  getClaimCurrentStep,
  userCanActOnFlowStep,
} from "@/lib/expenses/approval-flow";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function MobileApprovalsPage({ searchParams }: Props) {
  const session = await requireRole(MOBILE_MANAGER_ROLES);
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "done" ? "done" : "pending";
  const expenseOn = isExpenseFeatureEnabled();

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
    ReturnType<typeof prisma.followUp.findMany<{ include: typeof followUpInclude }>>
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
    return {
      ...row,
      pendingContacts,
      pendingOpportunities: pendingOpportunities.map((o) => ({
        ...o,
        expectedAmount: Number(o.expectedAmount),
      })),
    };
  }

  const [pendingClaims, doneClaims, pendingContracts, doneContracts, pendingFollowUpsRaw, doneFollowUpsRaw, stageOptions, pendingExpenseRows, doneExpenseRows] =
    await Promise.all([
      prisma.customerClaimRequest.findMany({
        where: { status: "PENDING" },
        include: {
          customer: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
          reviewer: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.customerClaimRequest.findMany({
        where: { status: { not: "PENDING" } },
        include: {
          customer: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
          reviewer: { select: { name: true } },
        },
        orderBy: { reviewedAt: "desc" },
        take: 20,
      }),
      prisma.contract.findMany({
        where: pendingContractApprovalFilter(),
        include: {
          owner: { select: { name: true } },
          signCustomer: { select: { name: true } },
          submittedBy: { select: { name: true } },
        },
        orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      }),
      prisma.contract.findMany({
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
        take: 20,
      }),
      prisma.followUp.findMany({
        where: { confirmStatus: "PENDING_MANAGER" },
        include: followUpInclude,
        orderBy: { createdAt: "asc" },
      }),
      prisma.followUp.findMany({
        where: {
          confirmedAt: { not: null },
          confirmedById: { not: null },
          OR: [{ confirmStatus: "REJECTED" }, { confirmStatus: "CONFIRMED" }],
        },
        include: followUpInclude,
        orderBy: { confirmedAt: "desc" },
        take: 30,
      }),
      getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE),
      expenseOn
        ? prisma.expenseClaim.findMany({
            where: {
              status: { in: ["PENDING_MANAGER", "PENDING_HR", "PENDING_PAYOUT"] },
            },
            include: {
              applicant: { select: { name: true } },
              manager: { select: { name: true } },
            },
            orderBy: { submittedAt: "asc" },
            take: 50,
          })
        : Promise.resolve([]),
      expenseOn
        ? prisma.expenseClaim.findMany({
            where: {
              status: { in: ["PAID", "REJECTED"] },
              approvals: { some: { actorId: session.user.id } },
            },
            include: {
              applicant: { select: { name: true } },
              manager: { select: { name: true } },
              payout: { select: { paidAt: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: 30,
          })
        : Promise.resolve([]),
    ]);

  const stageLabels = Object.fromEntries(stageOptions.map((item) => [item.value, item.label]));
  const pendingFollowUps = pendingFollowUpsRaw.map(withProxyBundle);
  const doneFollowUpsFiltered = doneFollowUpsRaw
    .filter(
      (row) =>
        row.confirmStatus === "REJECTED" ||
        (row.confirmedById != null && row.confirmedById !== row.userId)
    )
    .map(withProxyBundle);

  const pendingExpenses = pendingExpenseRows.filter((claim) => {
    const step = getClaimCurrentStep(claim);
    return (
      Boolean(step) &&
      userCanActOnFlowStep({
        step: step!,
        user: session.user,
        managerId: claim.managerId,
        isFirstActiveStep: true,
      })
    );
  });

  const claims = tab === "pending" ? pendingClaims : doneClaims;
  const contracts = tab === "pending" ? pendingContracts : doneContracts;
  const followUps = tab === "pending" ? pendingFollowUps : doneFollowUpsFiltered;
  const expenses = tab === "pending" ? pendingExpenses : doneExpenseRows;
  const pendingTotal =
    pendingClaims.length +
    pendingContracts.length +
    pendingFollowUps.length +
    pendingExpenses.length;
  const hasItems =
    claims.length > 0 ||
    contracts.length > 0 ||
    followUps.length > 0 ||
    expenses.length > 0;

  const href = (nextTab: string) =>
    nextTab === "pending" ? "/mobile/approvals" : `/mobile/approvals?tab=${nextTab}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">审批</h1>
        <p className="text-xs text-muted-foreground">
          待审 {pendingTotal} 条 · 含报销与非本人客户录入确认
        </p>
      </header>

      <div className="shrink-0 flex gap-2 border-b px-4 py-2">
        <Link
          href={href("pending")}
          className={cn(
            "rounded-full px-3 py-1 text-xs",
            tab === "pending" ? "bg-muted font-medium" : "text-muted-foreground"
          )}
        >
          待处理
        </Link>
        <Link
          href={href("done")}
          className={cn(
            "rounded-full px-3 py-1 text-xs",
            tab === "done" ? "bg-muted font-medium" : "text-muted-foreground"
          )}
        >
          已处理
        </Link>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-8">
        {!hasItems ? (
          <p className="text-sm text-muted-foreground">
            {tab === "pending" ? "暂无待处理审批" : "暂无已处理记录"}
          </p>
        ) : (
          <>
            {expenses.length > 0 ? (
              <ExpenseApprovalList
                hrefPrefix="/mobile/expenses"
                items={expenses.map((row) => {
                  const payout =
                    "payout" in row
                      ? (row.payout as { paidAt: Date } | null | undefined)
                      : null;
                  return {
                    id: row.id,
                    title: row.title,
                    status: row.status,
                    totalAmount: Number(row.totalAmount),
                    submittedAt: row.submittedAt,
                    paidAt: payout?.paidAt ?? null,
                    applicant: row.applicant,
                    manager: row.manager,
                  };
                })}
              />
            ) : null}
            {claims.length > 0 ? (
              <CustomerClaimApprovalList items={claims} showActions={tab === "pending"} />
            ) : null}
            {contracts.length > 0 ? (
              <ContractApprovalList
                items={contracts.map((c) => ({
                  id: c.id,
                  title: c.title,
                  contractNo: c.contractNo,
                  totalAmount: Number(c.totalAmount),
                  submittedAt: c.submittedAt?.toISOString() ?? null,
                  signedAt: c.signedAt?.toISOString() ?? null,
                  owner: c.owner,
                  signCustomer: c.signCustomer,
                  submittedBy: c.submittedBy,
                }))}
                showActions={tab === "pending"}
                showTypeBadge
                onApprove={approveContract}
                onReject={rejectContract}
              />
            ) : null}
            {followUps.length > 0 ? (
              <FollowUpConfirmApprovalList
                items={followUps}
                showActions={tab === "pending"}
                stageLabels={stageLabels}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
