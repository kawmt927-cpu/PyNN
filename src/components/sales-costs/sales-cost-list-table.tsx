"use client";

import { SalesCostDetailDialog } from "@/components/sales-costs/sales-cost-detail-dialog";
import { SALES_COST_TYPE_LABELS } from "@/lib/sales-costs/labels";
import type { SalesCostListItem } from "@/lib/sales-costs/serialize";
import { formatAmount } from "@/lib/opportunities/funnel";

type DeleteAction = (formData: FormData) => Promise<void>;

type Props = {
  items: SalesCostListItem[];
  deleteAction: DeleteAction;
};

function relationLabel(item: SalesCostListItem): string {
  if (item.customerName) return item.customerName;
  if (item.presalesUserName) {
    return `售前：${item.presalesUserName}（${item.presalesDays ?? 0}天）`;
  }
  return "—";
}

export function SalesCostListTable({ items, deleteAction }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">日期</th>
            <th className="pb-2 pr-4">销售</th>
            <th className="pb-2 pr-4">类型</th>
            <th className="pb-2 pr-4">金额</th>
            <th className="pb-2 pr-4">关联</th>
            <th className="pb-2 pr-4">录入人</th>
            <th className="w-0 whitespace-nowrap pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-3 pr-4 whitespace-nowrap">
                {new Date(item.costDate).toLocaleDateString("zh-CN")}
              </td>
              <td className="py-3 pr-4">{item.salesUserName}</td>
              <td className="py-3 pr-4">{SALES_COST_TYPE_LABELS[item.costType]}</td>
              <td className="py-3 pr-4">{formatAmount(item.totalAmount)}</td>
              <td className="py-3 pr-4 text-muted-foreground">{relationLabel(item)}</td>
              <td className="py-3 pr-4">{item.recordedByName}</td>
              <td className="w-0 whitespace-nowrap py-3">
                <SalesCostDetailDialog item={item} deleteAction={deleteAction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
