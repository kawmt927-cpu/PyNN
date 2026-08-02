/**
 * 报销模块开关：本地开发默认开启；生产未显式设为 true 则关闭入口。
 * 设 ENABLE_EXPENSE_REIMBURSEMENT=true 才对用户暴露报销导航/页面。
 */
export function isExpenseFeatureEnabled() {
  const raw = process.env.ENABLE_EXPENSE_REIMBURSEMENT?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  // 未配置：仅本地开发默认开，避免生产误开
  return process.env.NODE_ENV !== "production";
}
