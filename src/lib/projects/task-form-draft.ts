import type { ProjectTaskStatus } from "@prisma/client";

export type TaskFormDraft = {
  name: string;
  description: string;
  plannedStartAt: string;
  plannedEndAt: string;
  status: ProjectTaskStatus;
  assigneeId: string;
  actualCompletedAt?: string;
  cancelledNote?: string;
};

type ScheduleReturn = {
  projectId: string;
  taskId: string;
};

function draftKey(projectId: string, taskId: string) {
  return `project-plan-task-draft:${projectId}:${taskId}`;
}

const SCHEDULE_RETURN_KEY = "project-plan-schedule-return";

export function loadTaskFormDraft(projectId: string, taskId: string): TaskFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(draftKey(projectId, taskId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskFormDraft;
    if (!parsed || typeof parsed.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTaskFormDraft(
  projectId: string,
  taskId: string,
  draft: TaskFormDraft
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(draftKey(projectId, taskId), JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function clearTaskFormDraft(projectId: string, taskId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(draftKey(projectId, taskId));
  } catch {
    // ignore
  }
}

/** 离开计划页去排班时记下任务，避免排班页内跳转丢掉 URL 参数后无法回开弹窗 */
export function saveScheduleReturn(projectId: string, taskId: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ScheduleReturn = { projectId, taskId };
    sessionStorage.setItem(SCHEDULE_RETURN_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function peekScheduleReturn(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SCHEDULE_RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScheduleReturn;
    if (!parsed?.projectId || !parsed?.taskId) return null;
    return parsed.projectId === projectId ? parsed.taskId : null;
  } catch {
    return null;
  }
}

export function clearScheduleReturn(projectId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (projectId) {
      const current = peekScheduleReturn(projectId);
      if (!current) return;
    }
    sessionStorage.removeItem(SCHEDULE_RETURN_KEY);
  } catch {
    // ignore
  }
}

/** 给排班链接加上 returnTask，便于返回后重新打开任务详情 */
export function withScheduleReturnTask(scheduleHref: string, taskId: string): string {
  const [path, query = ""] = scheduleHref.split("?");
  const params = new URLSearchParams(query);
  params.set("returnTask", taskId);
  return `${path}?${params.toString()}`;
}
