import { SalesDailyLogStatus } from "@prisma/client";
import { DAILY_LOG_STATUS_LABELS } from "@/lib/sales-log/daily-reports";
import { cn } from "@/lib/utils";

type Props = {
  status: SalesDailyLogStatus;
  displayLabel?: string;
  overdue?: boolean;
  lateSubmission?: boolean;
  riskFlag?: boolean;
  className?: string;
};

export function DailyReportStatusBadge({
  status,
  displayLabel,
  overdue = false,
  lateSubmission = false,
  riskFlag,
  className,
}: Props) {
  const label = displayLabel ?? DAILY_LOG_STATUS_LABELS[status];
  const submitted = status === "SUBMITTED" || status === "RISK_SUBMITTED";
  const tone = overdue
    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    : lateSubmission
      ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200"
      : riskFlag
        ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200"
        : submitted
          ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";

  return (
    <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium", tone, className)}>
      {label}
    </span>
  );
}
