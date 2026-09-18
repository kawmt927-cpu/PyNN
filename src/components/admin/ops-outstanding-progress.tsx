"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatAmount } from "@/lib/opportunities/funnel";
import { withReturnTo } from "@/lib/navigation/return-to";
import { cn } from "@/lib/utils";
import type { OutstandingArSegment } from "@/lib/contracts/outstanding-ar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OpsArDialogKey } from "@/lib/admin/ops-ar-param";

export type OpsOutstandingArLine = {
  installmentId: string | null;
  depositId?: string | null;
  lineKind?: "installment" | "deposit";
  contractId: string;
  contractTitle: string;
  contractNo: string | null;
  endUserCustomerName: string;
  signCustomerName: string;
  signingType: string;
  customerName: string;
  periodNumber: number | null;
  condition: string | null;
  /** ISO 字符串或 Date（服务端传入时序列化） */
  dueAt?: string | Date | null;
  phaseName: string | null;
  phaseCompleted: boolean;
  collectionDifficulty: boolean;
  segment: OutstandingArSegment;
  remainingAmount: number;
};

export type OpsOutstandingArPayload = {
  totalRemaining: number;
  readyAmount: number;
  difficultAmount: number;
  pendingAmount: number;
  awaitingAmount: number;
  depositAmount: number;
  lines: OpsOutstandingArLine[];
};

const SEGMENTS: Array<{
  key: OutstandingArSegment;
  label: string;
  barClass: string;
  amountKey: keyof Pick<
    OpsOutstandingArPayload,
    | "readyAmount"
    | "difficultAmount"
    | "pendingAmount"
    | "awaitingAmount"
    | "depositAmount"
  >;
}> = [
  { key: "ready", label: "可催款", barClass: "bg-emerald-600", amountKey: "readyAmount" },
  { key: "difficult", label: "回款困难", barClass: "bg-amber-500", amountKey: "difficultAmount" },
  { key: "pending", label: "实施中", barClass: "bg-slate-500", amountKey: "pendingAmount" },
  { key: "awaiting", label: "待实施", barClass: "bg-zinc-300", amountKey: "awaitingAmount" },
  { key: "deposit", label: "保证金", barClass: "bg-sky-500", amountKey: "depositAmount" },
];

type ContractGroup = {
  contractId: string;
  href: string;
  endUserName: string;
  /** 间接合同时展示的签约方（渠道等） */
  indirectPartyName: string | null;
  contractTitle: string;
  contractNo: string | null;
  totalAmount: number;
  periods: Array<{
    id: string;
    periodLabel: string;
    dueLabel: string | null;
    meta: string;
    amount: number;
  }>;
};

function formatDueLabel(dueAt: string | Date | null | undefined) {
  if (!dueAt) return null;
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) return null;
  return `计划 ${format(date, "yyyy-MM-dd")}`;
}

function appendSearchParam(path: string, key: string, value: string) {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set(key, value);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function segmentLabel(segment: OutstandingArSegment) {
  return SEGMENTS.find((s) => s.key === segment)?.label ?? segment;
}

function groupLinesByContract(
  lines: OpsOutstandingArLine[],
  returnTo: string,
  options?: { includeSegmentInMeta?: boolean }
): ContractGroup[] {
  const includeSegment = options?.includeSegmentInMeta ?? true;
  const order: string[] = [];
  const map = new Map<string, ContractGroup>();

  for (const line of lines) {
    let group = map.get(line.contractId);
    if (!group) {
      const isIndirect =
        line.signingType === "INDIRECT" &&
        line.signCustomerName &&
        line.signCustomerName !== line.endUserCustomerName;
      group = {
        contractId: line.contractId,
        href: withReturnTo(`/contracts/${line.contractId}`, returnTo),
        endUserName: line.endUserCustomerName || line.customerName,
        indirectPartyName: isIndirect ? line.signCustomerName : null,
        contractTitle: line.contractTitle,
        contractNo: line.contractNo,
        totalAmount: 0,
        periods: [],
      };
      map.set(line.contractId, group);
      order.push(line.contractId);
    }

    group.totalAmount += line.remainingAmount;
    const isDeposit = line.lineKind === "deposit" || line.segment === "deposit";
    const periodLabel = isDeposit
      ? "保证金"
      : line.periodNumber != null
        ? `第 ${line.periodNumber} 期`
        : "合同余额";
    const metaParts = [
      includeSegment && !isDeposit ? segmentLabel(line.segment) : null,
      isDeposit ? line.condition : null,
      !isDeposit && line.phaseName
        ? `阶段 ${line.phaseName}${line.phaseCompleted ? "（已完成）" : ""}`
        : null,
      line.collectionDifficulty && !includeSegment ? "困难" : null,
    ].filter(Boolean);

    group.periods.push({
      id:
        line.depositId ??
        line.installmentId ??
        `contract-${line.contractId}-${periodLabel}`,
      periodLabel,
      dueLabel: isDeposit ? null : formatDueLabel(line.dueAt),
      meta: metaParts.join(" · "),
      amount: line.remainingAmount,
    });
  }

  return order.map((id) => {
    const group = map.get(id)!;
    return {
      ...group,
      totalAmount: Math.round(group.totalAmount * 100) / 100,
    };
  });
}

/** 悬停展示签约客户（不用原生 title，兼容内置浏览器） */
function IndirectSignBadge({ signCustomerName }: { signCustomerName: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openNow() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="shrink-0 cursor-default rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-800"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onFocus={openNow}
          onBlur={scheduleClose}
        >
          间接
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="pointer-events-auto w-auto max-w-xs px-2.5 py-1.5 text-xs"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onClick={(e) => e.stopPropagation()}
      >
        签约客户：{signCustomerName}
      </PopoverContent>
    </Popover>
  );
}

type Props = {
  data: OpsOutstandingArPayload;
  returnTo: string;
  /** 是否展示大额合计（与原指标卡合并） */
  showTotal?: boolean;
  net?: boolean;
  /** 从 URL ?ar= 恢复弹窗（从合同详情返回时） */
  initialOpen?: OpsArDialogKey | null;
};

export function OpsOutstandingProgress({
  data,
  returnTo,
  showTotal = false,
  net = false,
  initialOpen = null,
}: Props) {
  const router = useRouter();
  const [openSegment, setOpenSegment] = useState<OpsArDialogKey | null>(initialOpen);
  const total = data.totalRemaining;

  const dialogReturnTo = openSegment
    ? appendSearchParam(returnTo, "ar", openSegment)
    : returnTo;

  function setOpen(next: OpsArDialogKey | null) {
    setOpenSegment(next);
    const href = next ? appendSearchParam(returnTo, "ar", next) : returnTo;
    router.replace(href, { scroll: false });
  }

  const dialog = useMemo(() => {
    if (!openSegment) return null;

    if (openSegment === "all") {
      const groups = groupLinesByContract(data.lines, dialogReturnTo, {
        includeSegmentInMeta: true,
      });
      return {
        title: `全盘待回款${net ? "（净得）" : ""}`,
        description: `${groups.length} 份合同 · ${data.lines.length} 笔 · 合计 ${formatAmount(total)}`,
        empty: "暂无待回款",
        groups,
      };
    }

    const meta = SEGMENTS.find((s) => s.key === openSegment)!;
    const rows = data.lines.filter((line) => line.segment === openSegment);
    const amount = data[meta.amountKey];
    const groups = groupLinesByContract(rows, dialogReturnTo, {
      includeSegmentInMeta: false,
    });
    return {
      title: `待回款 · ${meta.label}`,
      description: `${groups.length} 份合同 · ${rows.length} 笔 · ${formatAmount(amount)}`,
      empty: `暂无「${meta.label}」余额`,
      groups,
    };
  }, [openSegment, data, dialogReturnTo, total, net]);

  if (total <= 0) {
    return (
      <div className="space-y-1">
        {showTotal ? (
          <p className="text-2xl font-semibold tabular-nums">{formatAmount(0)}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">当前无待回款余额。</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {showTotal ? (
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-2xl font-semibold tabular-nums">{formatAmount(total)}</p>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setOpen("all")}
            >
              查看全部明细
            </button>
          </div>
        ) : null}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {SEGMENTS.map((seg) => {
            const amount = data[seg.amountKey];
            if (amount <= 0) return null;
            const pct = Math.max(2, (amount / total) * 100);
            return (
              <button
                key={seg.key}
                type="button"
                title={`${seg.label} ${formatAmount(amount)}`}
                className={cn("h-full transition-opacity hover:opacity-90", seg.barClass)}
                style={{ width: `${pct}%` }}
                onClick={() => setOpen(seg.key)}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SEGMENTS.map((seg) => {
            const amount = data[seg.amountKey];
            return (
              <button
                key={seg.key}
                type="button"
                className="inline-flex items-center gap-1.5 hover:text-foreground"
                onClick={() => setOpen(seg.key)}
              >
                <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", seg.barClass)} />
                {seg.label} {formatAmount(amount)}
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={openSegment != null} onOpenChange={(open) => !open && setOpen(null)}>
        <DialogContent showCloseButton scrollable className="max-w-lg" aria-describedby={undefined}>
          {dialog ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.title}</DialogTitle>
                <DialogDescription>{dialog.description}</DialogDescription>
              </DialogHeader>
              {dialog.groups.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">{dialog.empty}</p>
              ) : (
                <ul className="mt-4 divide-y">
                  {dialog.groups.map((group) => (
                    <li key={group.contractId} className="py-3 first:pt-0 last:pb-0">
                      <Link
                        href={group.href}
                        className="block hover:opacity-90"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-sm font-medium">
                                {group.endUserName}
                              </span>
                              {group.indirectPartyName ? (
                                <IndirectSignBadge signCustomerName={group.indirectPartyName} />
                              ) : null}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {group.contractTitle}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-medium tabular-nums">
                            {formatAmount(group.totalAmount)}
                          </p>
                        </div>
                      </Link>
                      {group.periods.length > 0 ? (
                        <ul className="mt-2 space-y-1.5 border-l border-border/70 pl-3">
                          {group.periods.map((period) => (
                            <li
                              key={period.id}
                              className="flex items-baseline justify-between gap-3 text-xs"
                            >
                              <p className="min-w-0 truncate text-muted-foreground">
                                <span className="text-foreground">{period.periodLabel}</span>
                                {period.dueLabel ? ` · ${period.dueLabel}` : null}
                                {period.meta ? ` · ${period.meta}` : null}
                              </p>
                              <p className="shrink-0 tabular-nums text-foreground">
                                {formatAmount(period.amount)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
