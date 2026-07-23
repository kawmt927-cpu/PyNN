"use client";

import Link from "next/link";
import { ContractApprovalActions } from "@/components/contracts/contract-approval-actions";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import { formatAmount } from "@/lib/opportunities/funnel";
import type { ActionResult } from "@/lib/action-result";

export type ContractApprovalItem = {
  id: string;
  title: string;
  contractNo: string | null;
  totalAmount: number;
  submittedAt: string | null;
  signedAt: string | null;
  owner: { name: string };
  signCustomer: { name: string };
  submittedBy: { name: string } | null;
};

type ApproveAction = (contractId: string) => Promise<ActionResult>;
type RejectAction = (formData: FormData) => Promise<ActionResult>;

type Props = {
  items: ContractApprovalItem[];
  showActions?: boolean;
  /** 与客户认领混排时展示类型标签 */
  showTypeBadge?: boolean;
  onApprove?: ApproveAction;
  onReject?: RejectAction;
};

export function ContractApprovalList({
  items,
  showActions,
  showTypeBadge,
  onApprove,
  onReject,
}: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无记录。</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-md border p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              {showTypeBadge ? (
                <span className="mb-1 inline-block rounded bg-muted px-2 py-0.5 text-xs">
                  {APPROVAL_TYPE_LABELS.CONTRACT}
                </span>
              ) : null}
              <p className="font-medium">
                <Link href={`/contracts/${item.id}`} className="text-primary hover:underline">
                  {item.title}
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                签约客户：{item.signCustomer.name} · 负责销售：{item.owner.name}
              </p>
              <p className="text-sm text-muted-foreground">
                提交人：{item.submittedBy?.name ?? item.owner.name} · 金额：{formatAmount(item.totalAmount)}
              </p>
              {item.signedAt && (
                <p className="text-sm text-muted-foreground">签约日期：{item.signedAt.slice(0, 10)}</p>
              )}
            </div>
            {showActions && onApprove && onReject && (
              <ContractApprovalActions
                contractId={item.id}
                onApprove={onApprove}
                onReject={onReject}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
