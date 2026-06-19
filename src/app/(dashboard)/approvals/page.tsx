import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getPrismaClient } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerClaimApprovalList } from "@/components/approvals/customer-claim-approval-list";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ tab?: string; customerId?: string }>;
};

export default async function ApprovalsPage({ searchParams }: Props) {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const { tab: rawTab, customerId } = await searchParams;
  const tab = rawTab === "done" ? "done" : "pending";

  const pendingWhere = {
    status: "PENDING" as const,
    ...(customerId ? { customerId } : {}),
  };

  const db = getPrismaClient();

  const pendingRequests = await db.customerClaimRequest.findMany({
    where: pendingWhere,
    include: {
      customer: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
      reviewer: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const recentRequests = await db.customerClaimRequest.findMany({
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
  });

  const pendingCount = pendingRequests.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审批</h1>
        <p className="text-muted-foreground">
          统一处理各类待办审批，当前支持：{APPROVAL_TYPE_LABELS.CUSTOMER_CLAIM}
        </p>
      </div>

      {customerId && (
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          正在筛选指定客户的审批记录。
          <Link href="/approvals" className="ml-2 text-primary hover:underline">
            查看全部
          </Link>
        </div>
      )}

      <div className="flex gap-2 border-b">
        <TabLink
          href={customerId ? `/approvals?customerId=${customerId}` : "/approvals"}
          active={tab === "pending"}
          label={`待审批 (${pendingCount})`}
        />
        <TabLink
          href={customerId ? `/approvals?tab=done&customerId=${customerId}` : "/approvals?tab=done"}
          active={tab === "done"}
          label="已处理"
        />
      </div>

      {tab === "pending" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">待审批</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerClaimApprovalList items={pendingRequests} showActions />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">已处理</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerClaimApprovalList items={recentRequests} />
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
