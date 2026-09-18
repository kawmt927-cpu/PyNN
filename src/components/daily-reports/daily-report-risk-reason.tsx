import { cn } from "@/lib/utils";

const FALLBACK = "提交时标记了含风险，但未留下具体原因。";

type Props = {
  riskFlag?: boolean;
  riskNotes?: string | null;
  compact?: boolean;
  className?: string;
};

export function DailyReportRiskReason({
  riskFlag,
  riskNotes,
  compact = false,
  className,
}: Props) {
  if (!riskFlag) return null;
  const reason = riskNotes?.trim() || FALLBACK;

  if (compact) {
    return (
      <p
        className={cn(
          "rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100",
          className
        )}
      >
        <span className="font-medium">含风险：</span>
        {reason}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100",
        className
      )}
    >
      <p className="font-medium">含风险原因</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{reason}</p>
    </div>
  );
}
