import Link from "next/link";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
import type { ProjectListRow } from "@/lib/projects/cost-summary";
import { formatAmount } from "@/lib/opportunities/funnel";
import { CustomerNameLink } from "@/components/customers/customer-name-link";

type Props = {
  items: ProjectListRow[];
};

function formatPeriod(start: Date | null, end: Date | null) {
  if (!start && !end) return "—";
  const fmt = (d: Date) => d.toLocaleDateString("zh-CN");
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return fmt(end!);
}

export function ProjectListTable({ items }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">项目名称</th>
            <th className="pb-2 pr-4">客户</th>
            <th className="pb-2 pr-4">状态</th>
            <th className="pb-2 pr-4">项目经理</th>
            <th className="pb-2 pr-4">计划周期</th>
            <th className="pb-2 pr-4">进度</th>
            <th className="pb-2 pr-4">实际成本 / 合同</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-3 pr-4">
                <Link href={`/projects/${item.id}`} className="font-medium hover:underline">
                  {item.name}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <CustomerNameLink
                  customerId={item.customerId}
                  name={item.customerName}
                  fallback="内部项目"
                />
              </td>
              <td className="py-3 pr-4">
                {PROJECT_STATUS_LABELS[item.status as keyof typeof PROJECT_STATUS_LABELS] ??
                  item.status}
              </td>
              <td className="py-3 pr-4">{item.managerName ?? "—"}</td>
              <td className="py-3 pr-4 whitespace-nowrap">
                {formatPeriod(item.plannedStartAt, item.plannedEndAt)}
              </td>
              <td className="py-3 pr-4">{item.progressPercent}%</td>
              <td className="py-3 pr-4 whitespace-nowrap">
                {formatAmount(item.actualCost)}
                {item.contractAmount != null ? ` / ${formatAmount(item.contractAmount)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
