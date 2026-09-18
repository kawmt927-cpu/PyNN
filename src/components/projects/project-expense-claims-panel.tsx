import Link from "next/link";
import { format } from "date-fns";
import { CreateExpenseClaimButton } from "@/components/expenses/create-expense-claim-button";
import { EXPENSE_CLAIM_STATUS_LABELS } from "@/lib/expenses/labels";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { formatAmount } from "@/lib/opportunities/funnel";

type ClaimRow = {
  id: string;
  title: string;
  status: string;
  totalAmount: unknown;
  updatedAt: Date;
  applicant: { name: string };
  beneficiary: { name: string };
};

type Props = {
  projectId: string;
  projectName: string;
  expenseCost: number;
  claims: ClaimRow[];
  canCreate: boolean;
};

export function ProjectExpenseClaimsPanel({
  projectId,
  projectName,
  expenseCost,
  claims,
  canCreate,
}: Props) {
  const featureOn = isExpenseFeatureEnabled();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            已计入费用合计：{formatAmount(expenseCost)}。可在此发起挂本项目的报销，或在「报销」中选择本项目。
          </p>
        </div>
        {featureOn && canCreate ? (
          <CreateExpenseClaimButton
            projectId={projectId}
            projectName={projectName}
            label="发起报销"
            size="sm"
          />
        ) : null}
      </div>

      {!featureOn ? (
        <p className="text-sm text-muted-foreground">报销功能当前未开启。</p>
      ) : claims.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          暂无关联本项目的报销单。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">标题</th>
                <th className="px-3 py-2 font-medium">填报 / 报销人</th>
                <th className="px-3 py-2 font-medium">金额</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">更新</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/expenses/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {c.applicant.name}
                    {c.beneficiary.name !== c.applicant.name
                      ? ` → ${c.beneficiary.name}`
                      : ""}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    ¥{Number(c.totalAmount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5">
                    {EXPENSE_CLAIM_STATUS_LABELS[
                      c.status as keyof typeof EXPENSE_CLAIM_STATUS_LABELS
                    ] ?? c.status}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {format(c.updatedAt, "yyyy-MM-dd")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
