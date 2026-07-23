import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MOBILE_MANAGER_ROLES } from "@/lib/mobile/sales-roles";
import { CustomerClaimApprovalList } from "@/components/approvals/customer-claim-approval-list";
import { ContractApprovalList } from "@/components/approvals/contract-approval-list";
import { pendingContractApprovalFilter } from "@/lib/contracts/approval";
import { approveContract, rejectContract } from "@/app/(dashboard)/contracts/actions";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function MobileApprovalsPage({ searchParams }: Props) {
  await requireRole(MOBILE_MANAGER_ROLES);
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "done" ? "done" : "pending";

  const [pendingClaims, doneClaims, pendingContracts, doneContracts] = await Promise.all([
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
  ]);

  const claims = tab === "pending" ? pendingClaims : doneClaims;
  const contracts = tab === "pending" ? pendingContracts : doneContracts;
  const pendingTotal = pendingClaims.length + pendingContracts.length;
  const hasItems = claims.length > 0 || contracts.length > 0;

  const href = (nextTab: string) =>
    nextTab === "pending" ? "/mobile/approvals" : `/mobile/approvals?tab=${nextTab}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">审批</h1>
        <p className="text-xs text-muted-foreground">待审 {pendingTotal} 条</p>
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
          </>
        )}
      </div>
    </div>
  );
}
