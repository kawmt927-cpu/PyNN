"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  countKpiProgress,
  formatKpiAmount,
  formatKpiCount,
  PAYMENT_COLLECTION_KPI_NOTE,
  type MonthlyKpiBundle,
} from "@/lib/plans-tasks/monthly-kpi";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProjectDevSettlementDialog } from "@/components/plans-tasks/project-dev-settlement-dialog";

function KpiDetailButton({ title, detail }: { title: string; detail: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`${title}说明`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-left text-sm leading-relaxed text-muted-foreground">
            {detail}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

function KpiCardShell({
  label,
  detail,
  trailing,
  children,
}: {
  label: string;
  detail: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[8.75rem] flex-col rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{label}</p>
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
          <KpiDetailButton title={label} detail={detail} />
        </div>
      </div>
      <div className="mt-1 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function TargetBlock({
  hasTarget,
  targetLabel,
  progress,
}: {
  hasTarget: boolean;
  targetLabel: string;
  progress: number | null;
}) {
  return (
    <div className="mt-auto pt-1">
      {hasTarget ? (
        <p className="text-xs text-muted-foreground">{targetLabel}</p>
      ) : (
        <p className="text-xs text-orange-600">尚未设定目标</p>
      )}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        {progress != null ? (
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-all",
              progress >= 100 && "bg-green-500"
            )}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function CountKpiCard({
  label,
  actual,
  target,
  detail,
  action,
}: {
  label: string;
  actual: number;
  target: number | null;
  detail: string;
  action?: ReactNode;
}) {
  const progress = countKpiProgress(actual, target);

  return (
    <KpiCardShell
      label={label}
      detail={detail}
      trailing={
        <>
          {action}
          {progress != null ? (
            <span className="text-sm font-semibold tabular-nums text-primary">{progress}%</span>
          ) : null}
        </>
      }
    >
      <p className="text-2xl font-bold tabular-nums">{formatKpiCount(actual)}</p>
      <TargetBlock
        hasTarget={target != null}
        targetLabel={`目标 ${formatKpiCount(target ?? 0)}`}
        progress={progress}
      />
    </KpiCardShell>
  );
}

function AmountKpiCard({
  label,
  actual,
  target,
  detail,
}: {
  label: string;
  actual: number;
  target: number | null;
  detail: string;
}) {
  const progress = countKpiProgress(actual, target);

  return (
    <KpiCardShell
      label={label}
      detail={detail}
      trailing={
        progress != null ? (
          <span className="text-sm font-semibold tabular-nums text-primary">{progress}%</span>
        ) : null
      }
    >
      <p className="text-2xl font-bold tabular-nums">{formatKpiAmount(actual)}</p>
      <TargetBlock
        hasTarget={target != null}
        targetLabel={`目标 ${formatKpiAmount(target ?? 0)}`}
        progress={progress}
      />
    </KpiCardShell>
  );
}

function ComplianceKpiCard({
  actual,
}: {
  actual: MonthlyKpiBundle["actuals"]["processCompliance"];
}) {
  return (
    <KpiCardShell
      label="过程规范与日报"
      detail={[
        "按时完成：当日有打卡，且日报在 22:00 前提交。",
        "迟交、漏交分别统计次数。",
        "记分制目标暂未启用，仅记录次数；后续将接入 KPI 积分计算。",
      ].join("\n")}
    >
      <p className="text-2xl font-bold tabular-nums">{formatKpiCount(actual.onTimeCount)}</p>
      <p className="mt-1 text-xs text-muted-foreground">按时完成</p>
      <div className="mt-auto flex flex-wrap gap-3 pt-3 text-xs">
        <span className="text-orange-600">迟交 {actual.lateCount} 次</span>
        <span className="text-red-600">漏交 {actual.missedCount} 次</span>
      </div>
    </KpiCardShell>
  );
}

export function MonthlyKpiDashboard({
  kpi,
  subjectName,
  subjectUserId,
  allowProjectDevSettlement = false,
}: {
  kpi: MonthlyKpiBundle;
  subjectName?: string;
  /** 当前查看的销售 userId（核算用） */
  subjectUserId?: string;
  /** 销售管理/管理员可人工核算项目开发 */
  allowProjectDevSettlement?: boolean;
}) {
  const { targets, actuals, year, month } = kpi;

  return (
    <section className="space-y-3">
      {subjectName ? (
        <p className="text-sm text-muted-foreground">{subjectName} · 个人月度 KPI</p>
      ) : null}
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CountKpiCard
          label="渠道开发"
          actual={actuals.channelDev}
          target={targets?.channelDev ?? null}
          detail="新建关系类型为渠道的客户，且月内完成至少一次往来，计 1 次。"
        />
        <CountKpiCard
          label="项目开发"
          actual={actuals.projectDev}
          target={targets?.projectDev ?? null}
          detail={[
            "不再自动计次。",
            "当月商机阶段往前推进的记录会出现在「核算」列表中，由销售管理或管理员勾选后计入。",
            "一次跨多级推进在列表中仍为一条记录，勾选后计 1 次。",
          ].join("\n")}
          action={
            allowProjectDevSettlement && subjectUserId && subjectName ? (
              <ProjectDevSettlementDialog
                userId={subjectUserId}
                userName={subjectName}
                year={year}
                month={month}
              />
            ) : null
          }
        />
        <AmountKpiCard
          label="回款催收"
          actual={actuals.paymentCollection}
          target={targets?.paymentCollection ?? null}
          detail={PAYMENT_COLLECTION_KPI_NOTE}
        />
        <ComplianceKpiCard actual={actuals.processCompliance} />
        <CountKpiCard
          label="维护与赋能"
          actual={actuals.maintenance}
          target={targets?.maintenance ?? null}
          detail="拜访即将到期的客户（距客户等级截止日 7 天内）计次。"
        />
      </div>
    </section>
  );
}
