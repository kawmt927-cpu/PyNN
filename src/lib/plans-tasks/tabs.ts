import type { UserRole } from "@prisma/client";

export const PLANS_TASKS_TAB_DEFS = [
  { id: "tasks", label: "销售任务" },
  { id: "project", label: "项目任务" },
  { id: "dashboard", label: "指标概览" },
] as const;

export type PlansTasksTab = (typeof PLANS_TASKS_TAB_DEFS)[number]["id"];

export type PlansTasksCapabilities = {
  salesTasks: boolean;
  projectTasks: boolean;
  dashboard: boolean;
};

export function getPlansTasksCapabilities(role: UserRole): PlansTasksCapabilities {
  const sales =
    role === "SALES" || role === "SALES_MANAGER" || role === "ADMIN";
  const project =
    role === "PROJECT_ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "PROJECT_STAFF" ||
    role === "ADMIN";
  return {
    salesTasks: sales,
    projectTasks: project,
    dashboard: sales,
  };
}

export function visiblePlansTasksTabs(
  caps: PlansTasksCapabilities
): Array<(typeof PLANS_TASKS_TAB_DEFS)[number]> {
  return PLANS_TASKS_TAB_DEFS.filter((tab) => {
    if (tab.id === "tasks") return caps.salesTasks;
    if (tab.id === "project") return caps.projectTasks;
    if (tab.id === "dashboard") return caps.dashboard;
    return false;
  });
}

export function defaultPlansTasksTab(caps: PlansTasksCapabilities): PlansTasksTab {
  if (caps.salesTasks) return "tasks";
  if (caps.projectTasks) return "project";
  if (caps.dashboard) return "dashboard";
  return "tasks";
}

export function parsePlansTasksTab(
  value: string | undefined,
  caps: PlansTasksCapabilities
): PlansTasksTab {
  const requested =
    value === "dashboard" || value === "project" || value === "tasks"
      ? value
      : null;
  const visible = new Set(visiblePlansTasksTabs(caps).map((t) => t.id));
  if (requested && visible.has(requested)) return requested;
  return defaultPlansTasksTab(caps);
}

/** @deprecated 使用 PLANS_TASKS_TAB_DEFS */
export const PLANS_TASKS_TABS = PLANS_TASKS_TAB_DEFS;
