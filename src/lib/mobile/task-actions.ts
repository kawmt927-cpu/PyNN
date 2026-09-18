import type { UpcomingActionItem } from "@/lib/plans-tasks/upcoming-actions";

/** 手机端「待办任务」：指派 / 普通任务 / 催收回款（不含跟进计划） */
export function isMobileTaskAction(item: UpcomingActionItem) {
  return item.kind === "assignment" || item.kind === "payment_collection";
}

export function countMobileTaskActions(items: UpcomingActionItem[]) {
  return items.filter(isMobileTaskAction).length;
}
