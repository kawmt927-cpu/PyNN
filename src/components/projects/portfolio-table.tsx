import Link from "next/link";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
import type { PortfolioRow } from "@/lib/projects/portfolio";
import { withReturnTo } from "@/lib/navigation/return-to";
import { cn } from "@/lib/utils";

type Props = {
  rows: PortfolioRow[];
  returnTo?: string;
};

function formatDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("zh-CN");
}

export function PortfolioTable({ rows, returnTo = "/projects/portfolio" }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">项目</th>
            <th className="pb-2 pr-4">状态</th>
            <th className="pb-2 pr-4">计划结束</th>
            <th className="pb-2 pr-4">进度</th>
            <th className="pb-2 pr-4">风险备忘</th>
            <th className="pb-2 pr-4">项目经理</th>
            <th className="pb-2 pr-4">标记</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-3 pr-4">
                <Link
                  href={withReturnTo(`/projects/${row.id}`, returnTo)}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
              </td>
              <td className="py-3 pr-4">
                {PROJECT_STATUS_LABELS[row.status] ?? row.status}
              </td>
              <td
                className={cn(
                  "py-3 pr-4 whitespace-nowrap",
                  row.overdue && "font-medium text-rose-700"
                )}
              >
                {formatDate(row.plannedEndAt)}
              </td>
              <td className="py-3 pr-4">{row.progressPercent}%</td>
              <td className="py-3 pr-4">
                {row.riskMemoCount > 0 ? (
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-800">
                    {row.riskMemoCount}
                  </span>
                ) : (
                  "0"
                )}
              </td>
              <td className="py-3 pr-4">{row.managerName ?? "—"}</td>
              <td className="py-3 pr-4">
                <div className="flex flex-wrap gap-1">
                  {row.overdue ? (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-800">
                      逾期
                    </span>
                  ) : null}
                  {row.hasResourceConflict ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                      资源冲突
                    </span>
                  ) : null}
                  {!row.overdue && !row.hasResourceConflict ? (
                    <span className="text-muted-foreground">—</span>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
