import { format } from "date-fns";
import type { CustomerGradeFollowUpSchedule } from "@/lib/customers/grade-expiry";
import {
  getRemainingTimeInfo,
  remainingTimeClassName,
} from "@/lib/today-work/remaining-time";

type Props = {
  schedule: CustomerGradeFollowUpSchedule;
  compact?: boolean;
};

export function CustomerGradeFollowUpRemaining({ schedule, compact = false }: Props) {
  const remaining = getRemainingTimeInfo(schedule.dueAt);

  if (compact) {
    return (
      <span className={remainingTimeClassName(remaining.tone)} title={`截止 ${format(schedule.dueAt, "yyyy-MM-dd")}`}>
        {remaining.label}
      </span>
    );
  }

  return (
    <div className="space-y-0.5">
      <p className={remainingTimeClassName(remaining.tone)}>{remaining.label}</p>
      <p className="text-xs text-muted-foreground">
        {schedule.intervalDays} 天往来周期 · 截止 {format(schedule.dueAt, "yyyy-MM-dd")} · 上次往来{" "}
        {format(schedule.lastInteractionAt, "yyyy-MM-dd HH:mm")}
      </p>
    </div>
  );
}
