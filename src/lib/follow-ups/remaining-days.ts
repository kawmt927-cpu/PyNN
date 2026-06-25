export function formatPendingFollowUpRemainingDays(dueAt: Date, now = new Date()) {
  const diffMs = dueAt.getTime() - now.getTime();
  const dayMs = 86_400_000;

  if (diffMs <= 0) {
    const days = Math.max(1, Math.ceil(Math.abs(diffMs) / dayMs));
    return { label: `逾期 ${days} 天`, overdue: true };
  }

  const days = Math.max(1, Math.ceil(diffMs / dayMs));
  return { label: `${days} 天`, overdue: false };
}

/** 卡片/列表展示：未来计划显示「X 天后」，已到期显示「逾期 X 天」 */
export function formatPendingFollowUpRelativeLabel(dueAt: Date, now = new Date()) {
  const remaining = formatPendingFollowUpRemainingDays(dueAt, now);
  if (remaining.overdue) return remaining;
  const days = Math.max(1, Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000));
  return { label: `${days} 天后`, overdue: false };
}
