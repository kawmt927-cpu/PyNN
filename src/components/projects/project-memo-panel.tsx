"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AtSign, ChevronDown, ChevronRight, Clock, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToneSelect } from "@/components/ui/select-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import {
  PROJECT_MEMO_CATEGORY_BADGE_CLASS,
  PROJECT_MEMO_CATEGORY_LABELS,
  PROJECT_MEMO_FOLLOW_STATUS_BADGE_CLASS,
  PROJECT_MEMO_FOLLOW_STATUS_LABELS,
  PROJECT_MEMO_RISK_BADGE_CLASS,
} from "@/lib/projects/labels";
import {
  createProjectMemo,
  deleteProjectMemo,
  updateProjectMemo,
} from "@/app/(dashboard)/projects/project-memo-actions";
import type { PlanMemo, PlanPhase } from "@/components/projects/project-plan-types";

type Props = {
  projectId: string;
  canEdit: boolean;
  memos: PlanMemo[];
  phases: PlanPhase[];
  onSelectTask: (taskId: string) => void;
  onError?: (message: string | null) => void;
  onSuccess?: (message: string | null) => void;
  /** 未填计划起止时拦截发布/编辑备忘等操作 */
  runWithPlannedWindow?: (action: () => void) => void;
  onRefresh?: () => void;
};

const CATEGORY_OPTIONS = Object.entries(PROJECT_MEMO_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const FOLLOW_STATUS_OPTIONS = Object.entries(PROJECT_MEMO_FOLLOW_STATUS_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  })
);

function normalizeCategory(category: string): string {
  if (category === "FEEDBACK" || category === "MEETING" || category === "OTHER") {
    return category;
  }
  // 历史 RISK 等未知分类一律按「其它」展示/保存
  return "OTHER";
}

function sortByOrder<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
}

/** 备忘关联任务：搜索 + 按阶段展开/收起 + 整阶段勾选 */
function MemoTaskPicker({
  phases,
  selectedIds,
  onChange,
}: {
  phases: PlanPhase[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedQuery = query.trim().toLowerCase();

  const phaseGroups = useMemo(() => {
    return sortByOrder(phases)
      .map((phase) => {
        const tasks = sortByOrder(phase.tasks).filter((task) => {
          if (!normalizedQuery) return true;
          return (
            task.name.toLowerCase().includes(normalizedQuery) ||
            phase.name.toLowerCase().includes(normalizedQuery)
          );
        });
        return { phase, tasks };
      })
      .filter((group) => group.tasks.length > 0 || (!normalizedQuery && group.phase.tasks.length === 0));
  }, [phases, normalizedQuery]);

  // 搜索时自动展开有匹配任务的阶段
  useEffect(() => {
    if (!normalizedQuery) return;
    setExpandedIds(new Set(phaseGroups.filter((g) => g.tasks.length > 0).map((g) => g.phase.id)));
  }, [normalizedQuery, phaseGroups]);

  function toggleExpanded(phaseId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  function toggleTask(taskId: string) {
    if (selectedSet.has(taskId)) {
      onChange(selectedIds.filter((id) => id !== taskId));
      return;
    }
    onChange([...selectedIds, taskId]);
  }

  function togglePhase(taskIdsInPhase: string[]) {
    if (taskIdsInPhase.length === 0) return;
    const allSelected = taskIdsInPhase.every((id) => selectedSet.has(id));
    if (allSelected) {
      const remove = new Set(taskIdsInPhase);
      onChange(selectedIds.filter((id) => !remove.has(id)));
      return;
    }
    const next = new Set(selectedIds);
    for (const id of taskIdsInPhase) next.add(id);
    onChange([...next]);
  }

  const visibleTaskCount = phaseGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索任务或阶段…"
        className="h-8"
        autoFocus
      />
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {phaseGroups.length === 0 || (normalizedQuery && visibleTaskCount === 0) ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {normalizedQuery ? "无匹配任务" : "暂无阶段任务"}
          </p>
        ) : (
          phaseGroups.map(({ phase, tasks }) => {
            const allTaskIds = phase.tasks.map((t) => t.id);
            // 整阶段勾选以阶段全部任务为准；搜索时仅对当前可见任务操作
            const selectableIds = normalizedQuery ? tasks.map((t) => t.id) : allTaskIds;
            const selectedCount = selectableIds.filter((id) => selectedSet.has(id)).length;
            const allSelected =
              selectableIds.length > 0 && selectedCount === selectableIds.length;
            const someSelected = selectedCount > 0 && !allSelected;
            const expanded = expandedIds.has(phase.id);
            const empty = phase.tasks.length === 0;

            return (
              <div key={phase.id} className="rounded border border-transparent">
                <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-muted/60">
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                    disabled={empty && !normalizedQuery}
                    title={expanded ? "收起" : "展开"}
                    onClick={() => toggleExpanded(phase.id)}
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <label
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-0.5 text-sm",
                      empty && "cursor-default opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={allSelected}
                      disabled={selectableIds.length === 0}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={() => togglePhase(selectableIds)}
                    />
                    <span className="min-w-0 truncate font-medium" title={phase.name}>
                      {phase.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {empty
                        ? "暂无任务"
                        : selectedCount > 0
                          ? `${selectedCount}/${selectableIds.length || phase.tasks.length}`
                          : `${phase.tasks.length} 项`}
                    </span>
                  </label>
                </div>
                {expanded ? (
                  empty ? (
                    <p className="px-7 pb-1 text-[11px] text-muted-foreground">该阶段暂无子任务</p>
                  ) : (
                    <div className="space-y-0.5 pb-1 pl-6">
                      {(normalizedQuery ? tasks : sortByOrder(phase.tasks)).map((task) => {
                        const checked = selectedSet.has(task.id);
                        return (
                          <label
                            key={task.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-sm hover:bg-muted",
                              checked && "bg-primary/10"
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              onChange={() => toggleTask(task.id)}
                            />
                            <span className="min-w-0 truncate">{task.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ProjectMemoPanel({
  projectId,
  canEdit,
  memos,
  phases,
  onSelectTask,
  onError,
  onSuccess,
  runWithPlannedWindow,
  onRefresh,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [isRisk, setIsRisk] = useState(false);
  const [followStatus, setFollowStatus] = useState<"OPEN" | "DONE">("OPEN");
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const guard = (action: () => void) => {
    if (runWithPlannedWindow) runWithPlannedWindow(action);
    else action();
  };

  const allTasks = useMemo(
    () =>
      phases.flatMap((phase) =>
        phase.tasks.map((task) => ({
          id: task.id,
          name: task.name,
          phaseName: phase.name,
        }))
      ),
    [phases]
  );

  const hasPhases = phases.length > 0;

  const sortedMemos = useMemo(
    () => [...memos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [memos]
  );

  function insertTimestamp() {
    const stamp = formatLocalDateInput(new Date()) + " ";
    setContent((prev) => `${stamp}${prev}`);
  }

  function handleCreate() {
    guard(() => {
      if (!content.trim()) {
        onError?.("请填写备忘内容");
        return;
      }
      onError?.(null);
      startTransition(async () => {
        const result = await createProjectMemo({
          projectId,
          content,
          category: normalizeCategory(category),
          isRisk,
          followStatus,
          taskIds,
        });
        if (result.error) {
          onError?.(result.error);
          return;
        }
        setContent("");
        setCategory("OTHER");
        setIsRisk(false);
        setFollowStatus("OPEN");
        setTaskIds([]);
        onSuccess?.("备忘已发布");
        onRefresh?.();
      });
    });
  }

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="space-y-2 rounded-md border bg-muted/10 p-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="记录风险、反馈、会议纪要等…"
            rows={3}
            disabled={pending}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[8.5rem]">
              <ToneSelect
                size="sm"
                value={category}
                onValueChange={setCategory}
                options={CATEGORY_OPTIONS}
                disabled={pending}
              />
            </div>
            <div className="w-[7.5rem]">
              <ToneSelect
                size="sm"
                value={followStatus}
                onValueChange={(value) =>
                  setFollowStatus(value === "DONE" ? "DONE" : "OPEN")
                }
                options={FOLLOW_STATUS_OPTIONS}
                disabled={pending}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={pending}
              onClick={insertTimestamp}
            >
              <Clock className="h-3.5 w-3.5" />
              插入日期
            </Button>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  disabled={pending || !hasPhases}
                >
                  <AtSign className="h-3.5 w-3.5" />
                  关联任务{taskIds.length > 0 ? ` (${taskIds.length})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <MemoTaskPicker
                  phases={phases}
                  selectedIds={taskIds}
                  onChange={setTaskIds}
                />
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={pending || !content.trim()}
              onClick={handleCreate}
            >
              发布备忘
            </Button>
            <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isRisk}
                disabled={pending}
                onChange={(e) => setIsRisk(e.target.checked)}
              />
              标记为风险点
            </label>
          </div>
          {taskIds.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {taskIds.map((id) => {
                const task = allTasks.find((t) => t.id === id);
                if (!task) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
                    onClick={() => onSelectTask(id)}
                  >
                    @{task.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {sortedMemos.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">暂无备忘</p>
      ) : (
        <ul className="space-y-2">
          {sortedMemos.map((memo) => (
            <MemoListItem
              key={memo.id}
              projectId={projectId}
              memo={memo}
              canEdit={canEdit}
              onSelectTask={onSelectTask}
              onError={onError}
              onSuccess={onSuccess}
              runWithPlannedWindow={runWithPlannedWindow}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MemoListItem({
  projectId,
  memo,
  canEdit,
  onSelectTask,
  onError,
  onSuccess,
  runWithPlannedWindow,
  onRefresh,
}: {
  projectId: string;
  memo: PlanMemo;
  canEdit: boolean;
  onSelectTask: (taskId: string) => void;
  onError?: (message: string | null) => void;
  onSuccess?: (message: string | null) => void;
  runWithPlannedWindow?: (action: () => void) => void;
  onRefresh?: () => void;
}) {
  const guard = (action: () => void) => {
    if (runWithPlannedWindow) runWithPlannedWindow(action);
    else action();
  };
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memo.content);
  const [category, setCategory] = useState(normalizeCategory(memo.category));
  const [isRisk, setIsRisk] = useState(memo.isRisk);
  const [followStatus, setFollowStatus] = useState<"OPEN" | "DONE">(
    memo.followStatus === "DONE" ? "DONE" : "OPEN"
  );

  useEffect(() => {
    setContent(memo.content);
    setCategory(normalizeCategory(memo.category));
    setIsRisk(memo.isRisk);
    setFollowStatus(memo.followStatus === "DONE" ? "DONE" : "OPEN");
  }, [memo.content, memo.category, memo.isRisk, memo.followStatus]);

  function resetDraft() {
    setContent(memo.content);
    setCategory(normalizeCategory(memo.category));
    setIsRisk(memo.isRisk);
    setFollowStatus(memo.followStatus === "DONE" ? "DONE" : "OPEN");
  }

  const dirty =
    content.trim() !== memo.content.trim() ||
    category !== normalizeCategory(memo.category) ||
    isRisk !== memo.isRisk ||
    followStatus !== (memo.followStatus === "DONE" ? "DONE" : "OPEN");

  function save() {
    guard(() => {
      onError?.(null);
      startTransition(async () => {
        const result = await updateProjectMemo({
          projectId,
          memoId: memo.id,
          content,
          category,
          isRisk,
          followStatus,
        });
        if (result.error) {
          onError?.(result.error);
          return;
        }
        setEditing(false);
        onSuccess?.("备忘已保存");
        onRefresh?.();
      });
    });
  }

  const categoryLabel =
    PROJECT_MEMO_CATEGORY_LABELS[normalizeCategory(memo.category)] ?? "其它";

  const taskLinks =
    memo.taskLinks.length > 0 ? (
      <div className={cn("flex flex-wrap gap-1", editing ? undefined : "mt-2")}>
        {memo.taskLinks.map((link) => (
          <button
            key={link.taskId}
            type="button"
            className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
            onClick={() => onSelectTask(link.taskId)}
          >
            @{link.taskName}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <li className="rounded-md border p-3 text-sm">
      {canEdit && editing ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="w-[8.5rem]">
              <ToneSelect
                size="sm"
                value={category}
                onValueChange={setCategory}
                options={CATEGORY_OPTIONS}
                disabled={pending}
              />
            </div>
            <div className="w-[7.5rem]">
              <ToneSelect
                size="sm"
                value={followStatus}
                onValueChange={(value) =>
                  setFollowStatus(value === "DONE" ? "DONE" : "OPEN")
                }
                options={FOLLOW_STATUS_OPTIONS}
                disabled={pending}
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isRisk}
                disabled={pending}
                onChange={(e) => setIsRisk(e.target.checked)}
              />
              风险点
            </label>
            <span className="ml-auto">{memo.authorName}</span>
            <span>{formatLocalDateInput(memo.createdAt)}</span>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            disabled={pending}
            className="text-sm"
          />
          {taskLinks}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7"
              disabled={pending || !dirty || !content.trim()}
              onClick={save}
            >
              保存修改
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={pending}
              onClick={() => {
                resetDraft();
                setEditing(false);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-destructive"
              disabled={pending}
              onClick={() => {
                guard(() => {
                  startTransition(async () => {
                    const result = await deleteProjectMemo({
                      projectId,
                      memoId: memo.id,
                    });
                    if (result.error) onError?.(result.error);
                    else {
                      onSuccess?.("备忘已删除");
                      onRefresh?.();
                    }
                  });
                });
              }}
            >
              删除
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-medium",
                  PROJECT_MEMO_CATEGORY_BADGE_CLASS[normalizeCategory(memo.category)] ??
                    PROJECT_MEMO_CATEGORY_BADGE_CLASS.OTHER
                )}
              >
                {categoryLabel}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-medium",
                  PROJECT_MEMO_FOLLOW_STATUS_BADGE_CLASS[memo.followStatus] ??
                    PROJECT_MEMO_FOLLOW_STATUS_BADGE_CLASS.OPEN
                )}
              >
                {PROJECT_MEMO_FOLLOW_STATUS_LABELS[memo.followStatus] ?? memo.followStatus}
              </span>
              {memo.isRisk ? (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium",
                    PROJECT_MEMO_RISK_BADGE_CLASS
                  )}
                >
                  风险点
                </span>
              ) : null}
              <span>{memo.authorName}</span>
              <span>{formatLocalDateInput(memo.createdAt)}</span>
            </div>
            {canEdit ? (
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={pending}
                  onClick={() => {
                    guard(() => {
                      const next = memo.followStatus === "OPEN" ? "DONE" : "OPEN";
                      startTransition(async () => {
                        const result = await updateProjectMemo({
                          projectId,
                          memoId: memo.id,
                          followStatus: next,
                        });
                        if (result.error) onError?.(result.error);
                        else {
                          onSuccess?.(
                            next === "DONE" ? "已标为已跟进" : "已标为待跟进"
                          );
                          onRefresh?.();
                        }
                      });
                    });
                  }}
                >
                  标为
                  {memo.followStatus === "OPEN"
                    ? PROJECT_MEMO_FOLLOW_STATUS_LABELS.DONE
                    : PROJECT_MEMO_FOLLOW_STATUS_LABELS.OPEN}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 w-6 p-0"
                  disabled={pending}
                  title="编辑"
                  aria-label="编辑"
                  onClick={() => {
                    guard(() => {
                      resetDraft();
                      setEditing(true);
                    });
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  disabled={pending}
                  title="删除"
                  aria-label="删除"
                  onClick={() => {
                    guard(() => {
                      startTransition(async () => {
                        const result = await deleteProjectMemo({
                          projectId,
                          memoId: memo.id,
                        });
                        if (result.error) onError?.(result.error);
                        else {
                          onSuccess?.("备忘已删除");
                          onRefresh?.();
                        }
                      });
                    });
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{memo.content}</p>
          {taskLinks}
        </>
      )}
    </li>
  );
}
