import { cn } from "@/lib/utils";
import {
  formatMetricAmount,
  metricAssessmentTarget,
  metricProgress,
  metricProgressTone,
  METRIC_DEFINITIONS,
  type SalesMetrics,
  type TargetMetricsBundle,
} from "@/lib/plans-tasks/metrics";

const PROGRESS_BAR_CLASS = {
  good: "bg-green-500",
  warn: "bg-primary",
  bad: "bg-orange-500",
} as const;

const PROGRESS_TEXT_CLASS = {
  good: "text-green-600 dark:text-green-400",
  warn: "text-primary",
  bad: "text-orange-600 dark:text-orange-400",
} as const;

function MetricCard({
  label,
  actual,
  target,
  lowerIsBetter,
  assessment = true,
}: {
  label: string;
  actual: number;
  target: number | null;
  lowerIsBetter?: boolean;
  assessment?: boolean;
}) {
  if (!assessment) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">KPI</span>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{formatMetricAmount(actual)}</p>
        <p className="mt-1 text-xs text-muted-foreground">实际汇总 · 无考核目标</p>
      </div>
    );
  }

  const progress = metricProgress(actual, target);
  const tone = progress != null ? metricProgressTone(progress, lowerIsBetter) : null;
  const barWidth = progress != null ? Math.min(100, progress) : 0;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {progress != null && tone ? (
          <span className={cn("text-sm font-semibold tabular-nums", PROGRESS_TEXT_CLASS[tone])}>
            {progress}%
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatMetricAmount(actual)}</p>
      {target != null ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">目标 {formatMetricAmount(target)}</p>
          {progress != null && tone ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", PROGRESS_BAR_CLASS[tone])}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-orange-600">尚未设定目标</p>
      )}
    </div>
  );
}

function MetricsSection({
  title,
  target,
  actual,
  showTitle = true,
}: {
  title: string;
  target: SalesMetrics | null;
  actual: SalesMetrics;
  showTitle?: boolean;
}) {
  return (
    <section className="space-y-3">
      {showTitle ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRIC_DEFINITIONS.map(({ key, label, lowerIsBetter, assessment }) => (
          <MetricCard
            key={key}
            label={label}
            actual={actual[key]}
            target={metricAssessmentTarget(key, target)}
            lowerIsBetter={lowerIsBetter}
            assessment={assessment !== false}
          />
        ))}
      </div>
    </section>
  );
}

export function TargetMetricsDashboard({
  metrics,
  subjectName,
  variant = "standalone",
}: {
  metrics: TargetMetricsBundle;
  subjectName: string;
  variant?: "standalone" | "embedded";
}) {
  const content = (
    <MetricsSection
      title={`${metrics.year} 年度指标`}
      target={metrics.annual.target}
      actual={metrics.annual.actual}
      showTitle={variant !== "embedded"}
    />
  );

  if (variant === "embedded") {
    return content;
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {subjectName} · {metrics.year} 年度指标完成度（考核：销售额、毛利、回款；成本等为 KPI 看板）
      </p>
      {content}
    </div>
  );
}
