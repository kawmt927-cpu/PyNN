"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { OpsPeriodPreset } from "@/lib/admin/ops-dashboard";

type Props = {
  preset: OpsPeriodPreset;
  selectedYear: number | null;
  years: number[];
  fromMonth: string;
  toMonth: string;
  label: string;
};

function formatMonthLabel(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

function buildHref(input: {
  year?: number | null;
  from?: string | null;
  to?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.from && input.to) {
    params.set("from", input.from);
    params.set("to", input.to);
  } else if (input.year) {
    params.set("year", String(input.year));
  }
  const qs = params.toString();
  return qs ? `/admin/cost-ledger?${qs}` : "/admin/cost-ledger";
}

export function CostLedgerPeriodToolbar({
  preset,
  selectedYear,
  years,
  fromMonth,
  toMonth,
  label,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(fromMonth);
  const [to, setTo] = useState(toMonth);

  function goYear(year: number) {
    router.push(buildHref({ year }));
  }

  function applyRange() {
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return;
    setOpen(false);
    router.push(buildHref({ from, to }));
  }

  const customActive = preset === "custom";
  const triggerLabel = customActive
    ? fromMonth === toMonth
      ? formatMonthLabel(fromMonth)
      : `${formatMonthLabel(fromMonth)} – ${formatMonthLabel(toMonth)}`
    : "自定义月份";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        统计区间：外部成本按签约日 · 人力按关账年月 · 报销按打款日 · 销售费用按费用日 ·{" "}
        <span className="font-medium text-foreground">{label}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5">
          {years.map((year) => {
            const active = !customActive && selectedYear === year;
            return (
              <Button
                key={year}
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                className={cn("h-8 px-3", !active && "text-muted-foreground")}
                onClick={() => goYear(year)}
              >
                {year} 年
              </Button>
            );
          })}
        </div>

        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) {
              setFrom(fromMonth);
              setTo(toMonth);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={customActive ? "default" : "outline"}
              className="h-9 gap-1.5"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="max-w-[220px] truncate">{triggerLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[280px] p-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">选择月份区间</p>
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ledger-from-month" className="text-xs text-muted-foreground">
                    开始月份
                  </Label>
                  <Input
                    id="ledger-from-month"
                    type="month"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ledger-to-month" className="text-xs text-muted-foreground">
                    结束月份
                  </Label>
                  <Input
                    id="ledger-to-month"
                    type="month"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button type="button" size="sm" onClick={applyRange}>
                  确定
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
