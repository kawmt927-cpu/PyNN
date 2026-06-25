import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { CONFIG_MODULES, type ConfigModuleDef } from "@/lib/config-options";
import { requireSession } from "@/lib/session";

export type SettingsScope = "sales" | "project" | "system";

export const SETTINGS_TAB = {
  FIELDS: "fields",
  PRODUCTS: "products",
  KPI: "kpi",
  WECOM: "wecom",
  AI: "ai",
  AMAP: "amap",
} as const;

export type SettingsTabId = (typeof SETTINGS_TAB)[keyof typeof SETTINGS_TAB];

const SETTINGS_PAGE_ROLES: UserRole[] = [
  "ADMIN",
  "SALES_MANAGER",
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
];

const PROJECT_CONFIG_ROLES: UserRole[] = ["PROJECT_ADMIN", "PROJECT_MANAGER"];

export function canAccessSettings(role: UserRole): boolean {
  return SETTINGS_PAGE_ROLES.includes(role);
}

export function canAccessSettingsTab(role: UserRole, tab: string): boolean {
  if (tab === SETTINGS_TAB.WECOM || tab === SETTINGS_TAB.AI || tab === SETTINGS_TAB.AMAP) {
    return role === "ADMIN";
  }
  if (tab === SETTINGS_TAB.PRODUCTS) {
    return role === "ADMIN" || role === "SALES_MANAGER";
  }
  if (tab === SETTINGS_TAB.KPI) {
    return role === "ADMIN" || role === "SALES_MANAGER";
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
  if (mod.scope === "sales") return role === "SALES_MANAGER";
  if (mod.scope === "project") return PROJECT_CONFIG_ROLES.includes(role);
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
  if (role === "ADMIN" || role === "SALES_MANAGER") {
    tabs.push({ id: SETTINGS_TAB.PRODUCTS, label: "产品服务" });
    tabs.push({ id: SETTINGS_TAB.KPI, label: "KPI 设置" });
  }
  if (role === "ADMIN") {
    tabs.push({ id: SETTINGS_TAB.WECOM, label: "企业微信" });
    tabs.push({ id: SETTINGS_TAB.AI, label: "AI 助手" });
    tabs.push({ id: SETTINGS_TAB.AMAP, label: "打卡定位" });
  }
  return tabs;
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
  if (session.user.role !== "ADMIN") {
    throw new Error("无权修改企业微信配置");
  }
  return session;
}

export async function requireAiAgentSettingsAccess() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("无权修改 AI 助手配置");
  }
  return session;
}

export async function requireKpiSettingsAccess() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN" && session.user.role !== "SALES_MANAGER") {
    throw new Error("无权修改 KPI 设置");
  }
  return session;
}

export async function requireAmapSettingsAccess() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("无权修改打卡定位配置");
  }
  return session;
}
