import { SalesDailyLogStatus } from "@prisma/client";
import { DAILY_LOG_STATUS_LABELS } from "@/lib/sales-log/daily-reports";
import { cn } from "@/lib/utils";

type Props = {
  status: SalesDailyLogStatus;
  riskFlag?: boolean;
  className?: string;
};

export function DailyReportStatusBadge({ status, riskFlag, className }: Props) {
  const submitted = status === "SUBMITTED" || status === "RISK_SUBMITTED";
  const tone = riskFlag
    ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200"
    : submitted
      ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
      : "border-muted bg-muted/50 text-muted-foreground";

  return (
    <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium", tone, className)}>
      {DAILY_LOG_STATUS_LABELS[status]}
    </span>
  );
}
