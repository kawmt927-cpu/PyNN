import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerClaimApprovalList } from "@/components/approvals/customer-claim-approval-list";
import { ContractApprovalList } from "@/components/approvals/contract-approval-list";
import { APPROVAL_TYPE, APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ tab?: string; type?: string; customerId?: string }>;
};

export default async function ApprovalsPage({ searchParams }: Props) {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const { tab: rawTab, type: rawType, customerId } = await searchParams;
  const tab = rawTab === "done" ? "done" : "pending";
  const type = rawType === APPROVAL_TYPE.CONTRACT ? APPROVAL_TYPE.CONTRACT : APPROVAL_TYPE.CUSTOMER_CLAIM;

  const db = prisma;

  const [pendingClaims, recentClaims, pendingContracts, recentContracts] = await Promise.all([
    type === APPROVAL_TYPE.CUSTOMER_CLAIM
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
    type === APPROVAL_TYPE.CUSTOMER_CLAIM
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
    type === APPROVAL_TYPE.CONTRACT
      ? db.contract.findMany({
          where: { status: "PENDING_APPROVAL" },
          include: {
            owner: { select: { name: true } },
            signCustomer: { select: { name: true } },
            submittedBy: { select: { name: true } },
          },
          orderBy: { submittedAt: "asc" },
        })
      : Promise.resolve([]),
    type === APPROVAL_TYPE.CONTRACT
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
  ]);

  const [pendingClaimCount, pendingContractCount] = await Promise.all([
    db.customerClaimRequest.count({ where: { status: "PENDING" } }),
    db.contract.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);

  const pendingCount =
    type === APPROVAL_TYPE.CONTRACT ? pendingContracts.length : pendingClaims.length;

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
          统一处理各类待办审批：{Object.values(APPROVAL_TYPE_LABELS).join("、")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
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
