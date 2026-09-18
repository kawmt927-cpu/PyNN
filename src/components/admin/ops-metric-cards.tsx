"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAmount } from "@/lib/opportunities/funnel";
import { withReturnTo } from "@/lib/navigation/return-to";
import { cn } from "@/lib/utils";

export type OpsMetricContractRow = {
  id: string;
  title: string;
  contractNo: string | null;
  customerName: string;
  signedAt: string | null;
  totalAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
};

export type OpsMetricPaymentRow = {
  id: string;
  contractId: string;
  contractTitle: string;
  contractNo: string | null;
  customerName: string;
  paidAt: string;
  amount: number;
  kind?: "payment" | "deposit_recovery";
};

export type OpsMetricMaintenanceRow = {
  id: string;
  title: string;
  contractNo: string | null;
  customerName: string;
  maintenanceStartAt: string;
  maintenanceEndAt: string;
  maintenanceTotalAmount: number;
  annualMaintenanceAmount: number;
  contributionAmount: number;
};

export type OpsMetricCostBucket = {
  key: string;
  label: string;
  amount: number;
  hint: string;
};

type MetricKey = "signed" | "collected" | "costs" | "maintenance";

type MetricCard = {
  key: MetricKey;
  label: string;
  value: string;
  hint: string;
};

type Props = {
  periodLabel: string;
  cards: MetricCard[];
  contracts: OpsMetricContractRow[];
  payments: OpsMetricPaymentRow[];
  maintenance: OpsMetricMaintenanceRow[];
  costs: {
    totalAmount: number;
    buckets: OpsMetricCostBucket[];
  };
  /** 当前看板页路径（含查询参数），用于详情返回 */
  returnTo: string;
};

export function OpsMetricCards({
  periodLabel,
  cards,
  contracts,
  payments,
  maintenance,
  costs,
  returnTo,
}: Props) {
  const [openKey, setOpenKey] = useState<MetricKey | null>(null);

  const dialog = useMemo(() => {
    if (!openKey) return null;

    if (openKey === "maintenance") {
      const total = maintenance.reduce((s, r) => s + r.contributionAmount, 0);
      return {
        title: `${periodLabel} 维保总额`,
        description: `${maintenance.length} 份未结清维保合同 · 年额合计 ${formatAmount(total)}`,
        empty: "该区间暂无未结清的维保合同",
        rows: maintenance.map((c) => ({
          id: c.id,
          href: withReturnTo(`/contracts/${c.id}`, returnTo),
          primary: c.title,
          secondary: [
            c.customerName,
            `${format(new Date(c.maintenanceStartAt), "yyyy-MM-dd")} ~ ${format(new Date(c.maintenanceEndAt), "yyyy-MM-dd")}`,
            `年额 ${formatAmount(c.annualMaintenanceAmount)}`,
          ].join(" · "),
          amount: formatAmount(c.contributionAmount),
        })),
      };
    }

    if (openKey === "signed") {
      const total = contracts.reduce((s, r) => s + r.totalAmount, 0);
      return {
        title: `${periodLabel} 签约合同`,
        description: `${contracts.length} 份 · 合计 ${formatAmount(total)}`,
        empty: "该区间暂无已签合同",
        rows: contracts.map((c) => ({
          id: c.id,
          href: withReturnTo(`/contracts/${c.id}`, returnTo),
          primary: c.title,
          secondary: [
            c.customerName,
            c.signedAt ? `签约 ${format(new Date(c.signedAt), "yyyy-MM-dd")}` : null,
            c.contractNo,
          ]
            .filter(Boolean)
            .join(" · "),
          amount: formatAmount(c.totalAmount),
        })),
      };
    }

    if (openKey === "collected") {
      const total = payments.reduce((s, r) => s + r.amount, 0);
      return {
        title: `${periodLabel} 已回款`,
        description: `${payments.length} 笔 · 按回款/收回日合计 ${formatAmount(total)}`,
        empty: "该区间暂无回款记录",
        rows: payments.map((p) => ({
          id: p.id,
          href: withReturnTo(`/contracts/${p.contractId}`, returnTo),
          primary: p.contractTitle,
          secondary: [
            p.customerName,
            p.kind === "deposit_recovery"
              ? `保证金收回 ${format(new Date(p.paidAt), "yyyy-MM-dd")}`
              : `回款 ${format(new Date(p.paidAt), "yyyy-MM-dd")}`,
            p.contractNo,
          ]
            .filter(Boolean)
            .join(" · "),
          amount: formatAmount(p.amount),
        })),
      };
    }

    return {
      title: `${periodLabel} 总成本构成`,
      description: `合计 ${formatAmount(costs.totalAmount)}`,
      empty: "该区间暂无成本",
      rows: costs.buckets.map((bucket) => ({
        id: bucket.key,
        href: null as string | null,
        primary: bucket.label,
        secondary: bucket.hint,
        amount: formatAmount(bucket.amount),
      })),
    };
  }, [openKey, contracts, payments, maintenance, costs, periodLabel, returnTo]);

  return (
    <>
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          cards.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
        )}
      >
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
              <button
                type="button"
                className="mt-2 text-xs text-primary hover:underline"
                onClick={() => setOpenKey(card.key)}
              >
                查看详情
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={openKey != null} onOpenChange={(open) => !open && setOpenKey(null)}>
        <DialogContent
          showCloseButton
          scrollable
          className="max-w-lg"
          aria-describedby={undefined}
        >
          {dialog ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.title}</DialogTitle>
                <DialogDescription>{dialog.description}</DialogDescription>
              </DialogHeader>
              {dialog.rows.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">{dialog.empty}</p>
              ) : (
                <ul className="mt-4 divide-y">
                  {dialog.rows.map((row) => {
                    const body = (
                      <>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.primary}</p>
                          <p className="truncate text-xs text-muted-foreground">{row.secondary}</p>
                        </div>
                        <p className="shrink-0 text-sm font-medium tabular-nums">{row.amount}</p>
                      </>
                    );
                    return (
                      <li key={row.id}>
                        {row.href ? (
                          <Link
                            href={row.href}
                            className="flex items-start justify-between gap-3 py-2.5 hover:opacity-90"
                            onClick={() => setOpenKey(null)}
                          >
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-start justify-between gap-3 py-2.5">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
