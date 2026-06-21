export const PLANS_TASKS_TABS = [
  { id: "tasks", label: "任务列表" },
  { id: "dashboard", label: "指标概览" },
] as const;

export type PlansTasksTab = (typeof PLANS_TASKS_TABS)[number]["id"];

export function parsePlansTasksTab(value: string | undefined): PlansTasksTab {
  if (value === "dashboard") return "dashboard";
  return "tasks";
}
