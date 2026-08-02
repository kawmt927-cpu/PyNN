import Link from "next/link";
import { format } from "date-fns";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import { EXPENSE_CLAIM_STATUS_LABELS } from "@/lib/expenses/labels";

export type ExpenseApprovalListItem = {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  submittedAt: Date | null;
  paidAt?: Date | null;
  applicant: { name: string };
  manager?: { name: string } | null;
};

type Props = {
  items: ExpenseApprovalListItem[];
  emptyText?: string;
};

export function ExpenseApprovalList({ items, emptyText = "暂无记录" }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <li key={row.id} className="rounded-md border p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs">
              {APPROVAL_TYPE_LABELS.EXPENSE}
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
            状态：{EXPENSE_CLAIM_STATUS_LABELS[row.status] ?? row.status} · 金额 ¥
            {row.totalAmount.toFixed(2)}
            {row.manager ? ` · 上级 ${row.manager.name}` : ""}
          </p>
          <div className="mt-3">
            <Link href={`/expenses/${row.id}`} className="text-primary hover:underline">
              打开报销单
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
