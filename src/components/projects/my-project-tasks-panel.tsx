"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectTaskStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ToneSelect } from "@/components/ui/select-field";
import { FormSuccessMessage } from "@/components/ui/form-success-message";
import { cn } from "@/lib/utils";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { toDateOnly } from "@/lib/projects/workdays";
import {
  PROJECT_TASK_STATUS_BADGE_CLASS,
  PROJECT_TASK_STATUS_LABELS,
} from "@/lib/projects/labels";
import { resolveTaskProgressPercent } from "@/lib/projects/task-progress";
import { updateMyAssignedProjectTaskStatus } from "@/app/(dashboard)/my-tasks/actions";

export type MyProjectTaskRow = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectTaskStatus;
  progressPercent: number | null;
  plannedStartAt: Date;
  plannedEndAt: Date;
  projectId: string;
  projectName: string;
  phaseName: string;
  /** 当前用户对该项目的打开权限；管理者视为可打开 */
  canOpenPlan: boolean;
};

type FilterKey = "open" | "overdue" | "done" | "all";

const STATUS_OPTIONS = (Object.keys(PROJECT_TASK_STATUS_LABELS) as ProjectTaskStatus[]).map(
  (status) => ({
    value: status,
    label: PROJECT_TASK_STATUS_LABELS[status],
  })
);

/** 下拉触发器：按状态着色（未提交修改时更醒目） */
const STATUS_TRIGGER_CLASS: Record<ProjectTaskStatus, string> = {
  NOT_STARTED:
    "border-blue-300 bg-blue-50 font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  IN_PROGRESS:
    "border-teal-300 bg-teal-50 font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200",
  TESTING:
    "border-violet-300 bg-violet-50 font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  WAITING:
    "border-sky-300 bg-sky-50 font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  PAUSED:
    "border-amber-300 bg-amber-50 font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  COMPLETED:
    "border-slate-300 bg-slate-100 font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
};

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "open", label: "进行中" },
  { key: "overdue", label: "已逾期" },
  { key: "done", label: "已完成" },
  { key: "all", label: "全部" },
];

function isCompleted(status: ProjectTaskStatus) {
  return status === "COMPLETED";
}

function isOverdue(task: MyProjectTaskRow, today: Date) {
  if (isCompleted(task.status)) return false;
  return toDateOnly(task.plannedEndAt).getTime() < today.getTime();
}

function isOpen(task: MyProjectTaskRow) {
  return !isCompleted(task.status);
}

type Props = {
  tasks: MyProjectTaskRow[];
};

export function MyProjectTasksPanel({ tasks }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("open");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** 本地未提交的状态草稿 */
  const [drafts, setDrafts] = useState<Record<string, ProjectTaskStatus>>({});

  const today = useMemo(() => toDateOnly(new Date()), []);

  useEffect(() => {
    const ids = new Set(tasks.map((t) => t.id));
    setDrafts((prev) => {
      let changed = false;
      const next: Record<string, ProjectTaskStatus> = {};
      for (const [id, status] of Object.entries(prev)) {
        if (!ids.has(id)) {
          changed = true;
          continue;
        }
        const saved = tasks.find((t) => t.id === id)?.status;
        if (saved === status) {
          changed = true;
          continue;
        }
        next[id] = status;
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const counts = useMemo(() => {
    let open = 0;
    let overdue = 0;
    let done = 0;
    for (const task of tasks) {
      if (isCompleted(task.status)) done += 1;
      else open += 1;
      if (isOverdue(task, today)) overdue += 1;
    }
    return { open, overdue, done, all: tasks.length };
  }, [tasks, today]);

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      if (filter === "open") return isOpen(task);
      if (filter === "overdue") return isOverdue(task, today);
      if (filter === "done") return isCompleted(task.status);
      return true;
    });
  }, [tasks, filter, today]);

  function setDraft(taskId: string, status: ProjectTaskStatus, saved: ProjectTaskStatus) {
    setError(null);
    setDrafts((prev) => {
      if (status === saved) {
        if (!(taskId in prev)) return prev;
        const next = { ...prev };
        delete next[taskId];
        return next;
      }
      return { ...prev, [taskId]: status };
    });
  }

  function submitStatus(taskId: string, status: ProjectTaskStatus) {
    setError(null);
    setSuccess(null);
    setPendingId(taskId);
    startTransition(async () => {
      const result = await updateMyAssignedProjectTaskStatus({ taskId, status });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDrafts((prev) => {
        if (!(taskId in prev)) return prev;
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      setSuccess("任务状态已更新");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={filter === item.key ? "default" : "outline"}
            className="h-8"
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            <span className="ml-1 tabular-nums text-xs opacity-80">
              {counts[item.key]}
            </span>
          </Button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <FormSuccessMessage message={success} onClear={() => setSuccess(null)} />

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {tasks.length === 0
            ? "暂无指派给你的项目任务。项目经理在「项目计划」中指定负责人后会出现在这里。"
            : "当前筛选下没有任务。"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">任务</th>
                <th className="px-3 py-2 font-medium">项目 / 阶段</th>
                <th className="px-3 py-2 font-medium">计划区间</th>
                <th className="px-3 py-2 font-medium">进度</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => {
                const overdue = isOverdue(task, today);
                const progress = resolveTaskProgressPercent(task);
                const busy = pending && pendingId === task.id;
                const draftStatus = drafts[task.id] ?? task.status;
                const dirty = draftStatus !== task.status;
                return (
                  <tr key={task.id} className="border-b align-top">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{task.name}</div>
                      {task.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      ) : null}
                      {overdue ? (
                        <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          已逾期
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {task.canOpenPlan ? (
                        <Link
                          href={`/projects/${task.projectId}?tab=plan&taskId=${task.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {task.projectName}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{task.projectName}</span>
                      )}
                      <div className="text-xs text-muted-foreground">{task.phaseName}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {formatLocalDateInput(task.plannedStartAt)}
                      <span className="mx-1">~</span>
                      <span className={cn(overdue && "font-medium text-red-600")}>
                        {formatLocalDateInput(task.plannedEndAt)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{progress}%</td>
                    <td className="px-3 py-2.5">
                      <div className="w-[8.5rem] space-y-1.5">
                        <ToneSelect
                          size="sm"
                          value={draftStatus}
                          disabled={busy}
                          onValueChange={(value) =>
                            setDraft(task.id, value as ProjectTaskStatus, task.status)
                          }
                          options={STATUS_OPTIONS}
                          triggerClassName={cn(
                            STATUS_TRIGGER_CLASS[draftStatus],
                            dirty && "ring-2 ring-offset-1 ring-offset-background",
                            dirty &&
                              (draftStatus === "COMPLETED"
                                ? "ring-slate-400"
                                : draftStatus === "IN_PROGRESS"
                                  ? "ring-teal-400"
                                  : draftStatus === "TESTING"
                                    ? "ring-violet-400"
                                    : draftStatus === "WAITING"
                                      ? "ring-sky-400"
                                      : draftStatus === "PAUSED"
                                        ? "ring-amber-400"
                                        : "ring-blue-400")
                          )}
                        />
                        {dirty ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-block rounded px-1.5 py-0.5 text-[11px] font-medium",
                                PROJECT_TASK_STATUS_BADGE_CLASS[draftStatus]
                              )}
                            >
                              待提交 · {PROJECT_TASK_STATUS_LABELS[draftStatus]}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7"
                              disabled={busy}
                              onClick={() => submitStatus(task.id, draftStatus)}
                            >
                              {busy ? "提交中…" : "提交"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              disabled={busy}
                              onClick={() => setDraft(task.id, task.status, task.status)}
                            >
                              撤销
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {task.canOpenPlan ? (
                        <Button asChild type="button" size="sm" variant="outline" className="h-7">
                          <Link href={`/projects/${task.projectId}?tab=plan&taskId=${task.id}`}>
                            打开计划
                          </Link>
                        </Button>
                      ) : (
                        <div className="space-y-1">
                          <Button type="button" size="sm" variant="outline" className="h-7" disabled>
                            打开计划
                          </Button>
                          <p className="max-w-[9rem] text-[11px] leading-snug text-muted-foreground">
                            需项目经理授权后才能打开
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
