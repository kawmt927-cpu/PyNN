import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CUSTOMER_CLAIM_STATUS_LABELS } from "@/lib/permissions";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import {
  approveCustomerClaim,
  rejectCustomerClaim,
} from "@/app/(dashboard)/approvals/actions";
import { format } from "date-fns";
import type { CustomerClaimStatus } from "@prisma/client";

export type CustomerClaimApproval = {
  id: string;
  status: CustomerClaimStatus;
  message: string | null;
  reviewNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  requester: { id: string; name: string };
  reviewer: { name: string } | null;
  customer: { id: string; name: string };
};

type Props = {
  items: CustomerClaimApproval[];
  showActions?: boolean;
};

export function CustomerClaimApprovalList({ items, showActions }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无记录</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-md border p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs">
              {APPROVAL_TYPE_LABELS.CUSTOMER_CLAIM}
            </span>
            <span className="font-medium">{r.requester.name}</span>
            <span className="text-muted-foreground">·</span>
            <Link
              href={`/customers/${r.customer.id}`}
              className="text-primary hover:underline"
            >
              {r.customer.name}
            </Link>
            <span className="ml-auto text-muted-foreground">
              {format(r.createdAt, "yyyy-MM-dd HH:mm")}
            </span>
          </div>
          <p className="text-muted-foreground">
            状态：{CUSTOMER_CLAIM_STATUS_LABELS[r.status]}
          </p>
          {r.message && <p className="mt-1">申请说明：{r.message}</p>}
          {r.reviewNote && <p className="mt-1 text-muted-foreground">审批备注：{r.reviewNote}</p>}
          {r.reviewer && r.reviewedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {r.reviewer.name} 于 {format(r.reviewedAt, "yyyy-MM-dd HH:mm")} 处理
            </p>
          )}

          {showActions && r.status === "PENDING" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={approveCustomerClaim} className="flex items-center gap-2">
                <input type="hidden" name="requestId" value={r.id} />
                <Input name="reviewNote" placeholder="审批备注（可选）" className="h-8 w-40" />
                <Button type="submit" size="sm">
                  同意
                </Button>
              </form>
              <form action={rejectCustomerClaim} className="flex items-center gap-2">
                <input type="hidden" name="requestId" value={r.id} />
                <Input name="reviewNote" placeholder="拒绝原因（可选）" className="h-8 w-40" />
                <Button type="submit" size="sm" variant="outline">
                  拒绝
                </Button>
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
