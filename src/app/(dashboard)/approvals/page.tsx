import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerClaimApprovalList } from "@/components/approvals/customer-claim-approval-list";
import { ContractApprovalList } from "@/components/approvals/contract-approval-list";
import { ExpenseApprovalList } from "@/components/approvals/expense-approval-list";
import { APPROVAL_TYPE, APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import { pendingContractApprovalFilter } from "@/lib/contracts/approval";
import { approveContract, rejectContract } from "@/app/(dashboard)/contracts/actions";
import { ALL_AUTHED_ROLES, canFinanceExpense } from "@/lib/expenses/labels";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ tab?: string; type?: string; customerId?: string }>;
};

export default async function ApprovalsPage({ searchParams }: Props) {
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  const { tab: rawTab, type: rawType, customerId } = await searchParams;
  const tab = rawTab === "done" ? "done" : "pending";
  const canSalesApprovals =
    session.user.role === "SALES_MANAGER" || session.user.role === "ADMIN";
  const expenseOn = isExpenseFeatureEnabled();
  const isFinance = expenseOn && canFinanceExpense(session.user.role);

  const type =
    rawType === APPROVAL_TYPE.CONTRACT && canSalesApprovals
      ? APPROVAL_TYPE.CONTRACT
      : rawType === APPROVAL_TYPE.CUSTOMER_CLAIM && canSalesApprovals
        ? APPROVAL_TYPE.CUSTOMER_CLAIM
        : expenseOn && (rawType === APPROVAL_TYPE.EXPENSE || !canSalesApprovals)
          ? APPROVAL_TYPE.EXPENSE
          : APPROVAL_TYPE.CUSTOMER_CLAIM;

  const db = prisma;
  const expensePendingWhere =
    session.user.role === "ADMIN"
      ? {
          OR: [
            { status: "PENDING_MANAGER" as const },
            { status: "PENDING_PAYOUT" as const },
          ],
        }
      : {
          OR: [
            { managerId: session.user.id, status: "PENDING_MANAGER" as const },
            ...(isFinance ? [{ status: "PENDING_PAYOUT" as const }] : []),
          ],
        };

  const [
    pendingClaims,
    recentClaims,
    pendingContracts,
    recentContracts,
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
    type === APPROVAL_TYPE.EXPENSE && expenseOn
      ? db.expenseClaim.findMany({
          where: expensePendingWhere,
          include: {
            applicant: { select: { name: true } },
            manager: { select: { name: true } },
          },
          orderBy: { submittedAt: "asc" },
          take: 50,
        })
      : Promise.resolve([]),
    type === APPROVAL_TYPE.EXPENSE && expenseOn
      ? db.expenseClaim.findMany({
          where: {
            OR: [
              { managerId: session.user.id, status: { in: ["REJECTED", "PENDING_PAYOUT", "PAID"] } },
              ...(isFinance
                ? [{ status: "PAID" as const }]
                : []),
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

  const [pendingClaimCount, pendingContractCount, pendingExpenseCount] = await Promise.all([
    canSalesApprovals
      ? db.customerClaimRequest.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    canSalesApprovals
      ? db.contract.count({ where: pendingContractApprovalFilter() })
      : Promise.resolve(0),
    db.expenseClaim.count({ where: expensePendingWhere }),
  ]);

  const pendingCount =
    type === APPROVAL_TYPE.CONTRACT
      ? pendingContracts.length
      : type === APPROVAL_TYPE.EXPENSE
        ? pendingExpenses.length
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审批</h1>
        <p className="text-muted-foreground">
          统一处理各类待办审批：
          {canSalesApprovals
            ? Object.values(APPROVAL_TYPE_LABELS).join("、")
            : APPROVAL_TYPE_LABELS.EXPENSE}
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

      {customerId && type === APPROVAL_TYPE.CUSTOMER_CLAIM && (
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          正在筛选指定客户的审批记录。
          <Link href={typeQuery(APPROVAL_TYPE.CUSTOMER_CLAIM)} className="ml-2 text-primary hover:underline">
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
            ) : type === APPROVAL_TYPE.EXPENSE ? (
              <ExpenseApprovalList
                items={pendingExpenses.map((row) => ({
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
