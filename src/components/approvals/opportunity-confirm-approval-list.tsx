import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import {
  approveOpportunityConfirm,
  rejectOpportunityConfirm,
} from "@/app/(dashboard)/approvals/actions";
import { opportunityConfirmStatusLabel } from "@/lib/opportunities/confirm-status";
import { format } from "date-fns";
import type { FollowUpConfirmStatus } from "@prisma/client";
import { formatAmount } from "@/lib/opportunities/funnel";

export type OpportunityConfirmApproval = {
  id: string;
  confirmStatus: FollowUpConfirmStatus;
  title: string;
  expectedAmount: number;
  createdAt: Date;
  confirmRejectReason: string | null;
  confirmedAt: Date | null;
  owner: { id: string; name: string };
  createdBy: { id: string; name: string } | null;
  confirmedBy: { name: string } | null;
  customer: { id: string; name: string } | null;
};

type Props = {
  items: OpportunityConfirmApproval[];
  showActions?: boolean;
};

export function OpportunityConfirmApprovalList({ items, showActions }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无记录</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <li key={row.id} className="rounded-md border p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs">
              {APPROVAL_TYPE_LABELS.OPPORTUNITY_CONFIRM}
            </span>
            <span className="font-medium">
              {row.createdBy?.name ?? row.owner.name}
            </span>
            <span className="text-muted-foreground">·</span>
            {row.customer ? (
              <Link
                href={`/customers/${row.customer.id}`}
                className="text-primary hover:underline"
              >
                {row.customer.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">未指定客户</span>
            )}
            <span className="text-muted-foreground">·</span>
            <Link href={`/opportunities/${row.id}`} className="text-primary hover:underline">
              {row.title}
            </Link>
            <span className="ml-auto text-muted-foreground">
              {format(row.createdAt, "yyyy-MM-dd HH:mm")}
            </span>
          </div>
          <p className="text-muted-foreground">
            状态：{opportunityConfirmStatusLabel(row.confirmStatus)} · 预计{" "}
            {formatAmount(row.expectedAmount)} · 负责人 {row.owner.name}
          </p>
          {row.confirmRejectReason ? (
            <p className="mt-1 text-muted-foreground">驳回原因：{row.confirmRejectReason}</p>
          ) : null}
          {row.confirmedBy && row.confirmedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {row.confirmedBy.name} 于 {format(row.confirmedAt, "yyyy-MM-dd HH:mm")} 处理
            </p>
          ) : null}

          {showActions && row.confirmStatus === "PENDING_MANAGER" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={approveOpportunityConfirm}>
                <input type="hidden" name="opportunityId" value={row.id} />
                <Button type="submit" size="sm">
                  确认入库
                </Button>
              </form>
              <form action={rejectOpportunityConfirm} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="opportunityId" value={row.id} />
                <Input name="reason" placeholder="驳回原因（可选）" className="h-8 w-48" />
                <Button type="submit" size="sm" variant="outline">
                  驳回
                </Button>
              </form>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
