export type RemainingTimeTone = "normal" | "warning" | "urgent" | "danger";

export type RemainingTimeInfo = {
  label: string;
  tone: RemainingTimeTone;
  overdue: boolean;
};

export function getRemainingTimeInfo(dueAt: Date, now = new Date()): RemainingTimeInfo {
  const diffMs = dueAt.getTime() - now.getTime();

  if (diffMs < 0) {
    const overdueHours = Math.max(1, Math.ceil(Math.abs(diffMs) / 3_600_000));
    if (overdueHours >= 24) {
      const days = Math.ceil(overdueHours / 24);
      return { label: `已逾期 ${days} 天`, tone: "danger", overdue: true };
    }
    return { label: `已逾期 ${overdueHours} 小时`, tone: "danger", overdue: true };
  }

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours >= 24) {
    const days = Math.ceil(hours / 24);
    return { label: `剩余 ${days} 天`, tone: "normal", overdue: false };
  }
  if (hours >= 1) {
    return { label: `剩余 ${hours} 小时`, tone: hours <= 6 ? "warning" : "normal", overdue: false };
  }

  const minutes = Math.max(1, Math.ceil(diffMs / 60_000));
  return { label: `剩余 ${minutes} 分钟`, tone: "urgent", overdue: false };
}

export function remainingTimeClassName(tone: RemainingTimeTone) {
  switch (tone) {
    case "danger":
      return "text-destructive font-medium";
    case "urgent":
      return "text-orange-600 font-medium";
    case "warning":
      return "text-amber-600";
    default:
      return "text-muted-foreground";
  }
}
