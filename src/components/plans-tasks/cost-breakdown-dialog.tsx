"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMetricAmount, type CostBreakdown } from "@/lib/plans-tasks/metrics";

type Props = {
  breakdown: CostBreakdown;
  total: number;
  year: number;
};

function DetailRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function CostBreakdownDialog({ breakdown, total, year }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-xs text-primary hover:underline">
          详情
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{year} 年成本构成</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <DetailRow
            label="项目成本"
            value={formatMetricAmount(breakdown.projectCost)}
            hint="合同内录入的产品成本及其他费用"
          />
          <DetailRow
            label="日常商务成本"
            value={formatMetricAmount(breakdown.dailyBusinessCost)}
            hint="销售成本录入中的差旅、售前及商务费用"
          />
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="font-medium">合计</span>
            <span className="font-semibold tabular-nums">{formatMetricAmount(total)}</span>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
