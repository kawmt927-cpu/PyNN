"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import { withReturnTo } from "@/lib/navigation/return-to";
import { ScrollChainList } from "@/components/ui/scroll-chain";

export type OpsFocusOpportunityRow = {
  id: string;
  title: string;
  grade: string | null;
  expectedAmount: number;
  customerName: string | null;
  ownerName: string;
  expectedCloseDate: Date | string;
};

type GradeTab = "P0" | "P1";

type Props = {
  rows: OpsFocusOpportunityRow[];
  returnTo: string;
};

export function OpsFocusOpportunities({ rows, returnTo }: Props) {
  const counts = useMemo(() => {
    let p0 = 0;
    let p1 = 0;
    for (const row of rows) {
      if (row.grade === "P0") p0 += 1;
      else if (row.grade === "P1") p1 += 1;
    }
    return { P0: p0, P1: p1 };
  }, [rows]);

  const defaultTab: GradeTab = counts.P0 > 0 ? "P0" : "P1";
  const [tab, setTab] = useState<GradeTab>(defaultTab);

  const filtered = useMemo(
    () => rows.filter((row) => row.grade === tab),
    [rows, tab]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border p-0.5">
          {(["P0", "P1"] as const).map((key) => {
            const active = tab === key;
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                className={cn("h-8 px-3", !active && "text-muted-foreground")}
                onClick={() => setTab(key)}
              >
                {key}
              </Button>
            );
          })}
        </div>
        <Link
          href={withReturnTo(`/opportunities?status=NOT_SIGNED&grade=${tab}`, returnTo)}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          查看全部
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无未签约的 {tab} 商机。</p>
      ) : (
        <ScrollChainList className="max-h-[28rem] divide-y overflow-y-auto pr-1">
          {filtered.map((row) => {
            const customerLabel = row.customerName?.trim() || "未关联客户";
            const titleTip = row.title?.trim() || undefined;
            return (
              <li key={row.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={withReturnTo(`/opportunities/${row.id}`, returnTo)}
                  className="block hover:opacity-90"
                  title={titleTip}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-base font-semibold text-foreground"
                        title={titleTip}
                      >
                        {customerLabel}
                      </p>
                      {titleTip ? (
                        <p className="truncate text-xs text-muted-foreground">{titleTip}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right leading-snug">
                      {row.ownerName ? (
                        <p className="text-sm text-muted-foreground">{row.ownerName}</p>
                      ) : null}
                      <p className="text-sm tabular-nums font-medium text-foreground">
                        {formatAmount(row.expectedAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        预计 {formatExpectedCloseMonth(row.expectedCloseDate)}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ScrollChainList>
      )}
    </div>
  );
}
