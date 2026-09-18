import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { CONFIG_MODULES, type ConfigModuleDef } from "@/lib/config-options";
import { requireSession } from "@/lib/session";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { hasPermission, hasPermissionSync } from "@/lib/rbac/has-permission";
import { defaultPermissionEnabled } from "@/lib/rbac/permission-keys";

export type SettingsScope = "sales" | "project" | "system";

export const SETTINGS_TAB = {
  FIELDS: "fields",
  PRODUCTS: "products",
  PROJECT_MODELS: "project-models",
  KPI: "kpi",
  SALES_LOG: "sales-log",
  WECOM: "wecom",
  AI: "ai",
  AMAP: "amap",
  EXPENSE_TRAVEL: "expense-travel",
  FEATURES: "features",
  ROLES: "roles",
} as const;

export type SettingsTabId = (typeof SETTINGS_TAB)[keyof typeof SETTINGS_TAB];

export function canAccessSettings(role: UserRole): boolean {
  return hasPermissionSync(role, "nav.admin_settings");
}

export function canAccessSettingsTab(role: UserRole, tab: string): boolean {
  if (tab === SETTINGS_TAB.ROLES) {
    return hasPermissionSync(role, "admin.manage_roles");
  }
  if (tab === SETTINGS_TAB.SALES_LOG) {
    return hasPermissionSync(role, "settings.sales");
  }
  if (tab === SETTINGS_TAB.WECOM || tab === SETTINGS_TAB.AI || tab === SETTINGS_TAB.AMAP) {
    return hasPermissionSync(role, "settings.system");
  }
  if (tab === SETTINGS_TAB.EXPENSE_TRAVEL) {
    if (!isExpenseFeatureEnabled()) return false;
    return defaultPermissionEnabled(role, "expense.settings");
  }
  if (tab === SETTINGS_TAB.FEATURES) {
    return hasPermissionSync(role, "settings.system");
  }
  if (tab === SETTINGS_TAB.PRODUCTS || tab === SETTINGS_TAB.KPI) {
    return hasPermissionSync(role, "settings.sales");
  }
  if (tab === SETTINGS_TAB.PROJECT_MODELS) {
    return (
      hasPermissionSync(role, "settings.project") &&
      (role === "ADMIN" || role === "PROJECT_ADMIN" || hasPermissionSync(role, "projects.admin"))
    );
  }
  if (tab === SETTINGS_TAB.FIELDS) {
    return canAccessSettings(role) && getAccessibleConfigModules(role).length > 0;
  }
  return false;
}

export function canManageConfigModule(role: UserRole, moduleId: string): boolean {
  if (role === "ADMIN") return true;
  const mod = CONFIG_MODULES.find((item) => item.id === moduleId);
  if (!mod) return false;
  if (mod.scope === "sales") return hasPermissionSync(role, "settings.sales");
  if (mod.scope === "project") return hasPermissionSync(role, "settings.project");
  return false;
}

export function canManageConfigCategory(role: UserRole, category: string): boolean {
  if (role === "ADMIN") return true;
  for (const mod of CONFIG_MODULES) {
    if (mod.fields.some((field) => field.category === category)) {
      return canManageConfigModule(role, mod.id);
    }
  }
  return false;
}

export function getAccessibleConfigModules(role: UserRole): ConfigModuleDef[] {
  if (role === "ADMIN") return CONFIG_MODULES;
  return CONFIG_MODULES.filter((mod) => canManageConfigModule(role, mod.id));
}

export function getAccessibleSettingsTabs(role: UserRole): Array<{ id: SettingsTabId; label: string }> {
  const tabs: Array<{ id: SettingsTabId; label: string }> = [];
  if (getAccessibleConfigModules(role).length > 0) {
    tabs.push({ id: SETTINGS_TAB.FIELDS, label: "字段选项" });
  }
  if (canAccessSettingsTab(role, SETTINGS_TAB.PROJECT_MODELS)) {
    tabs.push({ id: SETTINGS_TAB.PROJECT_MODELS, label: "项目模型" });
  }
  if (hasPermissionSync(role, "settings.sales")) {
    tabs.push({ id: SETTINGS_TAB.PRODUCTS, label: "产品服务" });
    tabs.push({ id: SETTINGS_TAB.KPI, label: "KPI 设置" });
    tabs.push({ id: SETTINGS_TAB.SALES_LOG, label: "日志助手" });
  }
  if (hasPermissionSync(role, "settings.system")) {
    tabs.push({ id: SETTINGS_TAB.WECOM, label: "企业微信" });
    tabs.push({ id: SETTINGS_TAB.AI, label: "AI 助手" });
    tabs.push({ id: SETTINGS_TAB.AMAP, label: "打卡定位" });
    tabs.push({ id: SETTINGS_TAB.FEATURES, label: "功能开关" });
  }
  if (hasPermissionSync(role, "admin.manage_roles")) {
    tabs.push({ id: SETTINGS_TAB.ROLES, label: "角色权限" });
  }
  if (isExpenseFeatureEnabled() && defaultPermissionEnabled(role, "expense.settings")) {
    tabs.push({ id: SETTINGS_TAB.EXPENSE_TRAVEL, label: "报销设置" });
  }
  return tabs;
}

/** 异步版：按 RolePermission 表过滤可见 Tab */
export async function getAccessibleSettingsTabsAsync(
  role: UserRole
): Promise<Array<{ id: SettingsTabId; label: string }>> {
  const tabs = getAccessibleSettingsTabs(role);
  const out: Array<{ id: SettingsTabId; label: string }> = [];
  for (const tab of tabs) {
    if (tab.id === SETTINGS_TAB.EXPENSE_TRAVEL) {
      if (!(await hasPermission(role, "expense.settings"))) continue;
    }
    if (tab.id === SETTINGS_TAB.ROLES) {
      if (!(await hasPermission(role, "admin.manage_roles"))) continue;
    }
    out.push(tab);
  }
  return out;
}

export function resolveAccessibleConfigField(
  modules: ConfigModuleDef[],
  moduleId: string | undefined,
  category: string | undefined
) {
  if (category) {
    for (const mod of modules) {
      const field = mod.fields.find((item) => item.category === category);
      if (field) return { module: mod, field };
    }
  }
  const mod = modules.find((item) => item.id === moduleId) ?? modules[0];
  const field = mod?.fields.find((item) => item.category === category) ?? mod?.fields[0];
  return { module: mod, field };
}

export async function requireSettingsPageAccess() {
  const session = await requireSession();
  if (!canAccessSettings(session.user.role)) redirect("/");
  return session;
}

export async function requireConfigCategoryManage(category: string) {
  const session = await requireSession();
  if (!canManageConfigCategory(session.user.role, category)) {
    throw new Error("无权修改该配置项");
  }
  return session;
}

export async function requireWeComSettingsAccess() {
  const session = await requireSession();
  if (!(await hasPermission(session.user.role, "settings.system"))) {
    throw new Error("无权修改企业微信配置");
  }
  return session;
}

export async function requireSalesLogPromptSettingsAccess() {
  const session = await requireSession();
  if (!(await hasPermission(session.user.role, "settings.sales"))) {
    throw new Error("无权修改日志助手提示词");
  }
  return session;
}

export async function requireAiAgentSettingsAccess() {
  const session = await requireSession();
  if (!(await hasPermission(session.user.role, "settings.system"))) {
    throw new Error("无权修改 AI 助手配置");
  }
  return session;
}

export async function requireKpiSettingsAccess() {
  const session = await requireSession();
  if (!(await hasPermission(session.user.role, "settings.sales"))) {
    throw new Error("无权修改 KPI 设置");
  }
  return session;
}

export async function requireAmapSettingsAccess() {
  const session = await requireSession();
  if (!(await hasPermission(session.user.role, "settings.system"))) {
    throw new Error("无权修改打卡定位配置");
  }
  return session;
}

export async function requireExpenseTravelSettingsAccess() {
  const session = await requireSession();
  if (!isExpenseFeatureEnabled()) {
    throw new Error("报销功能未启用");
  }
  if (!(await hasPermission(session.user.role, "expense.settings"))) {
    throw new Error("无权修改差旅住宿标准");
  }
  return session;
}
