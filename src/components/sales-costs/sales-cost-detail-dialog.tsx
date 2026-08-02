"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { SalesCostType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SALES_COST_TYPE_LABELS } from "@/lib/sales-costs/labels";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";
import { TRAVEL_ITEM_FIELDS } from "@/lib/sales-costs/travel-items";
import type { SalesCostListItem } from "@/lib/sales-costs/serialize";
import { formatAmount } from "@/lib/opportunities/funnel";
import { CustomerNameLink } from "@/components/customers/customer-name-link";

type DeleteAction = (formData: FormData) => Promise<void>;

type Props = {
  item: SalesCostListItem;
  deleteAction: DeleteAction;
};

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function SalesCostDetailDialog({ item, deleteAction }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirmDestructiveAction("确定删除这条成本记录吗？")) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", item.id);
      await deleteAction(formData);
      setOpen(false);
      router.refresh();
    });
  }

  const hasTravel =
    item.costType === SalesCostType.PERSONAL_TRAVEL || item.costType === SalesCostType.PRESALES;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-sm text-primary hover:underline">
          详情
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" showCloseButton scrollable>
        <DialogHeader>
          <DialogTitle>成本详情</DialogTitle>
        </DialogHeader>

        <dl className="space-y-3">
          <DetailField
            label="费用日期"
            value={new Date(item.costDate).toLocaleDateString("zh-CN")}
          />
          <DetailField label="归属销售" value={item.salesUserName} />
          <DetailField label="费用类型" value={SALES_COST_TYPE_LABELS[item.costType]} />
          <DetailField label="总金额" value={formatAmount(item.totalAmount)} />
          <DetailField label="录入人" value={item.recordedByName} />

          {item.costType === SalesCostType.BUSINESS ? (
            <>
              <DetailField
                label="关联客户"
                value={
                  <CustomerNameLink
                    customerId={item.customerId}
                    name={item.customerName}
                  />
                }
              />
              {item.description ? (
                <DetailField label="备注" value={item.description} />
              ) : null}
            </>
          ) : null}

          {item.costType === SalesCostType.PRESALES ? (
            <>
              <DetailField label="售前人员" value={item.presalesUserName ?? "—"} />
              <DetailField label="支持天数" value={item.presalesDays ?? "—"} />
              {item.presalesPersonnelCost != null ? (
                <DetailField
                  label="售前人力"
                  value={formatAmount(item.presalesPersonnelCost)}
                />
              ) : null}
            </>
          ) : null}

          {hasTravel ? (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium">差旅分项</p>
              {TRAVEL_ITEM_FIELDS.map(({ amountKey, noteKey, label }) => {
                const amount = item[amountKey];
                const note = item[noteKey];
                if ((amount ?? 0) <= 0 && !note) return null;
                return (
                  <div key={amountKey} className="rounded-md border bg-muted/30 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{label}</span>
                      <span>{formatAmount(amount ?? 0)}</span>
                    </div>
                    {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
          <Button asChild>
            <Link href={`/sales-costs/${item.id}/edit`}>编辑</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? "删除中…" : "删除"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
