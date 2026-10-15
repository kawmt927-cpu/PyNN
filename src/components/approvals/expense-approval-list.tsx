import Link from "next/link";
import { format } from "date-fns";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import {
  EXPENSE_CLAIM_KIND_LABELS,
  formatExpenseClaimStepStatus,
} from "@/lib/expenses/labels";

export type ExpenseApprovalListItem = {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  submittedAt: Date | null;
  paidAt?: Date | null;
  applicant: { name: string };
  manager?: { name: string } | null;
  claimKind?: string;
  currentStepName?: string | null;
};

type Props = {
  items: ExpenseApprovalListItem[];
  emptyText?: string;
  /** 详情链接前缀，默认 PC `/expenses`；手机端传 `/mobile/expenses` */
  hrefPrefix?: string;
};

export function ExpenseApprovalList({
  items,
  emptyText = "暂无记录",
  hrefPrefix = "/expenses",
}: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <li key={row.id} className="rounded-md border p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs">
              {row.claimKind
                ? EXPENSE_CLAIM_KIND_LABELS[row.claimKind] ?? APPROVAL_TYPE_LABELS.EXPENSE
                : APPROVAL_TYPE_LABELS.EXPENSE}
            </span>
            <span className="font-medium">{row.title}</span>
            <span className="text-muted-foreground">·</span>
            <span>{row.applicant.name}</span>
            <span className="ml-auto text-muted-foreground">
              {row.submittedAt
                ? format(row.submittedAt, "yyyy-MM-dd HH:mm")
                : "—"}
            </span>
          </div>
          <p className="text-muted-foreground">
            状态：
            {formatExpenseClaimStepStatus(
              row.status,
              row.manager?.name,
              row.currentStepName
            )}{" "}
            · 金额 ¥{row.totalAmount.toFixed(2)}
            {row.manager ? ` · 上级 ${row.manager.name}` : ""}
          </p>
          <div className="mt-3">
            <Link
              href={`${hrefPrefix}/${row.id}`}
              className="text-primary hover:underline"
            >
              打开报销单
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
