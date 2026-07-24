/** 销售日志确认后自动写入的无客户定位打卡备注（工作动态合并用） */
export const AUTO_DAILY_LOG_CHECK_IN_NOTES = "销售日志确认后自动定位打卡";

export function isAutoDailyLogCheckIn(row: {
  customerId?: string | null;
  notes?: string | null;
}): boolean {
  return !row.customerId && row.notes?.trim() === AUTO_DAILY_LOG_CHECK_IN_NOTES;
}
