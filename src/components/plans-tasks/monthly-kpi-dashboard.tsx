import { cn } from "@/lib/utils";
import {
  countKpiProgress,
  formatKpiAmount,
  formatKpiCount,
  PAYMENT_COLLECTION_KPI_NOTE,
  type MonthlyKpiBundle,
} from "@/lib/plans-tasks/monthly-kpi";

function CountKpiCard({
  label,
  actual,
  target,
  hint,
}: {
  label: string;
  actual: number;
  target: number | null;
  hint?: string;
}) {
  const progress = countKpiProgress(actual, target);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {progress != null ? (
          <span className="text-sm font-semibold tabular-nums text-primary">{progress}%</span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatKpiCount(actual)}</p>
      {target != null ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">目标 {formatKpiCount(target)}</p>
          {progress != null ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-all",
                  progress >= 100 && "bg-green-500"
                )}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-orange-600">尚未设定目标</p>
      )}
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AmountKpiCard({
  label,
  actual,
  target,
  hint,
}: {
  label: string;
  actual: number;
  target: number | null;
  hint?: string;
}) {
  const progress = countKpiProgress(actual, target);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {progress != null ? (
          <span className="text-sm font-semibold tabular-nums text-primary">{progress}%</span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatKpiAmount(actual)}</p>
      {target != null ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">目标 {formatKpiAmount(target)}</p>
          {progress != null ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full bg-primary transition-all", progress >= 100 && "bg-green-500")}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-orange-600">尚未设定目标</p>
      )}
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ComplianceKpiCard({
  actual,
}: {
  actual: MonthlyKpiBundle["actuals"]["processCompliance"];
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">过程规范与日报</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatKpiCount(actual.onTimeCount)}</p>
      <p className="mt-1 text-xs text-muted-foreground">按时完成（22:00 前提交且当日有打卡）</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <span className="text-orange-600">迟交 {actual.lateCount} 次</span>
        <span className="text-red-600">漏交 {actual.missedCount} 次</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        记分制目标暂未启用，仅记录次数；后续将接入 KPI 积分计算。
      </p>
    </div>
  );
}

export function MonthlyKpiDashboard({
  kpi,
  subjectName,
}: {
  kpi: MonthlyKpiBundle;
  subjectName?: string;
}) {
  const { targets, actuals, year, month } = kpi;

  return (
    <section className="space-y-3">
      {subjectName ? (
        <p className="text-sm text-muted-foreground">{subjectName} · 个人月度 KPI</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CountKpiCard
          label="渠道开发"
          actual={actuals.channelDev}
          target={targets?.channelDev ?? null}
          hint="新建关系类型为渠道的客户，且月内完成至少一次往来"
        />
        <CountKpiCard
          label="项目开发"
          actual={actuals.projectDev}
          target={targets?.projectDev ?? null}
          hint="自有商机达到设定阶段或已签约"
        />
        <AmountKpiCard
          label="回款催收"
          actual={actuals.paymentCollection}
          target={targets?.paymentCollection ?? null}
          hint={PAYMENT_COLLECTION_KPI_NOTE}
        />
        <ComplianceKpiCard actual={actuals.processCompliance} />
        <CountKpiCard
          label="维护与赋能"
          actual={actuals.maintenance}
          target={targets?.maintenance ?? null}
          hint="拜访即将到期的客户（距等级截止日 7 天内）"
        />
      </div>
    </section>
  );
}
