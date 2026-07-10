"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AllocationMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";
import { ALLOCATION_MODE_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { formatPersonDays } from "@/lib/projects/timeline";
import {
  dateRangesOverlap,
} from "@/lib/projects/allocation-overlap";
import {
  buildAllocationDailySegments,
  computeEffectiveDays,
  getPersonDailyLoad,
  mergePeerRecordsWithAllocation,
  type AllocationRecord,
} from "@/lib/projects/allocation-split";
import { countCalendarDays, eachCalendarDay, toDateOnly } from "@/lib/projects/workdays";
import { parseDateOnlyInput } from "@/lib/validations/project";
import type { ScheduleBar } from "@/lib/projects/schedule-serialize";
import { isDraftScheduleBarId } from "@/lib/projects/schedule-serialize";
import {
  createProjectAllocation,
  deleteProjectAllocation,
  updateProjectAllocation,
} from "@/app/(dashboard)/projects/allocation-actions";

type SegmentDraft = {
  key: string;
  id?: string;
  startDate: string;
  endDate: string;
  allocationMode: AllocationMode;
  plannedDays: string;
  notes: string;
};

type Props = {
  bar: ScheduleBar | null;
  projectSegments: ScheduleBar[];
  canEdit: boolean;
  peerRecords: AllocationRecord[];
  /** 拖拽新增分段时的初始日期 */
  draftSegment?: { startDate: string; endDate: string } | null;
  onClose: () => void;
  onSaved?: () => void;
};

function formatDailyShareLabel(share: number): string {
  if (share <= 0) return "0 人日/天";
  if (Math.abs(share - 1) < 0.001) return "1 人日/天";
  return `${formatPersonDays(share)} 人日/天`;
}

function formatDateRangeLabel(start: Date, end: Date): string {
  const from = formatLocalDateInput(start);
  const to = formatLocalDateInput(end);
  return from === to ? from : `${from} 至 ${to}`;
}

function barToDraft(bar: ScheduleBar): SegmentDraft {
  const isDraft = isDraftScheduleBarId(bar.id);
  return {
    key: isDraft ? `new-${bar.id}` : bar.id,
    id: isDraft ? undefined : bar.id,
    startDate: formatLocalDateInput(new Date(bar.startDate)),
    endDate: formatLocalDateInput(new Date(bar.endDate)),
    allocationMode: bar.allocationMode,
    plannedDays: bar.plannedDays != null ? String(bar.plannedDays) : "",
    notes: bar.notes ?? "",
  };
}

function dayAfter(dateStr: string): string {
  const next = parseDateOnlyInput(dateStr);
  next.setDate(next.getDate() + 1);
  return formatLocalDateInput(next);
}

function defaultDatesAfterLastSegment(last: SegmentDraft): {
  startDate: string;
  endDate: string;
} {
  const startDate = dayAfter(last.endDate);
  const spanDays = Math.max(
    0,
    Math.round(
      (parseDateOnlyInput(last.endDate).getTime() -
        parseDateOnlyInput(last.startDate).getTime()) /
        86400000
    )
  );
  const end = parseDateOnlyInput(startDate);
  end.setDate(end.getDate() + spanDays);
  return { startDate, endDate: formatLocalDateInput(end) };
}

function newDraftSegment(
  bar: ScheduleBar,
  dates?: { startDate: string; endDate: string }
): SegmentDraft {
  return {
    key: `new-${Date.now()}`,
    startDate: dates?.startDate ?? formatLocalDateInput(new Date(bar.startDate)),
    endDate: dates?.endDate ?? formatLocalDateInput(new Date(bar.endDate)),
    allocationMode: "AUTO",
    plannedDays: "",
    notes: "",
  };
}

function buildInitialSegments(
  bar: ScheduleBar,
  projectSegments: ScheduleBar[],
  draftSegment?: { startDate: string; endDate: string } | null
): SegmentDraft[] {
  if (projectSegments.length === 0) {
    if (draftSegment) return [newDraftSegment(bar, draftSegment)];
    return [barToDraft(bar)];
  }

  const base = [...projectSegments]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map(barToDraft);

  if (!draftSegment) return base;

  const overlapIdx = base.findIndex((segment) =>
    dateRangesOverlap(
      segment.startDate,
      segment.endDate,
      draftSegment.startDate,
      draftSegment.endDate
    )
  );
  if (overlapIdx >= 0) {
    base[overlapIdx] = {
      ...base[overlapIdx],
      startDate: draftSegment.startDate,
      endDate: draftSegment.endDate,
    };
    return base;
  }

  return [...base, newDraftSegment(bar, draftSegment)];
}

export function AllocationEditDialog({
  bar,
  projectSegments,
  canEdit,
  peerRecords,
  draftSegment,
  onClose,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentDraft[]>(() =>
    bar ? buildInitialSegments(bar, projectSegments, draftSegment) : []
  );
  const [activeKey, setActiveKey] = useState(() => {
    if (!bar) return "";
    const initial = buildInitialSegments(bar, projectSegments, draftSegment);
    const overlap = draftSegment
      ? initial.find((s) =>
          dateRangesOverlap(s.startDate, s.endDate, draftSegment.startDate, draftSegment.endDate)
        )
      : initial.find((s) => s.id === bar.id);
    return overlap?.key ?? initial[initial.length - 1]?.key ?? "";
  });

  const activeIndex = segments.findIndex((s) => s.key === activeKey);
  const active = activeIndex >= 0 ? segments[activeIndex] : segments[0];

  useEffect(() => {
    setSegments((prev) => {
      const unsaved = prev.filter((s) => !s.id);
      const saved = projectSegments.map(barToDraft);
      return [...saved, ...unsaved].sort(
        (a, b) =>
          parseDateOnlyInput(a.startDate).getTime() - parseDateOnlyInput(b.startDate).getTime()
      );
    });
  }, [projectSegments]);

  const preview = useMemo(() => {
    if (!bar || !active?.startDate || !active?.endDate) return null;
    try {
      const rangeStart = toDateOnly(parseDateOnlyInput(active.startDate));
      const rangeEnd = toDateOnly(parseDateOnlyInput(active.endDate));
      if (rangeStart.getTime() > rangeEnd.getTime()) return null;

      const plannedDays =
        active.allocationMode === "MANUAL" && active.plannedDays.trim()
          ? Number(active.plannedDays)
          : null;

      const record: AllocationRecord = {
        id: active.id ?? active.key,
        projectId: bar.projectId,
        userId: bar.userId,
        startDate: rangeStart,
        endDate: rangeEnd,
        allocationMode: active.allocationMode,
        plannedDays: plannedDays != null && plannedDays > 0 ? plannedDays : null,
        splitWeight: null,
        dailyRateSnapshot: bar.dailyRateSnapshot,
      };

      const siblingRecords: AllocationRecord[] = segments
        .filter((s) => s.key !== active.key)
        .flatMap((segment) => {
          try {
            return [
              {
                id: segment.id ?? segment.key,
                projectId: bar.projectId,
                userId: bar.userId,
                startDate: toDateOnly(parseDateOnlyInput(segment.startDate)),
                endDate: toDateOnly(parseDateOnlyInput(segment.endDate)),
                allocationMode: segment.allocationMode,
                plannedDays:
                  segment.allocationMode === "MANUAL" && segment.plannedDays.trim()
                    ? Number(segment.plannedDays)
                    : null,
                splitWeight: null,
                dailyRateSnapshot: bar.dailyRateSnapshot,
              },
            ];
          } catch {
            return [];
          }
        });

      const others = peerRecords.filter(
        (p) =>
          !(p.projectId === bar.projectId && p.userId === bar.userId) ||
          segments.some((s) => s.id === p.id)
      );
      const mergedPeers = mergePeerRecordsWithAllocation(record, [
        ...others,
        ...siblingRecords.filter((s) => s.id !== record.id),
      ]);

      const scheduleSpanDays = countCalendarDays(rangeStart, rangeEnd);
      const effectiveDays = computeEffectiveDays(record, mergedPeers);
      const calcSegments = buildAllocationDailySegments(record, mergedPeers);
      const overloadDays = eachCalendarDay(rangeStart, rangeEnd).filter((day) =>
        getPersonDailyLoad(bar.userId, day, mergedPeers).overloaded
      ).length;

      let totalEffective = 0;
      for (const segment of segments) {
        try {
          const s = toDateOnly(parseDateOnlyInput(segment.startDate));
          const e = toDateOnly(parseDateOnlyInput(segment.endDate));
          const segRecord: AllocationRecord = {
            id: segment.id ?? segment.key,
            projectId: bar.projectId,
            userId: bar.userId,
            startDate: s,
            endDate: e,
            allocationMode: segment.allocationMode,
            plannedDays:
              segment.allocationMode === "MANUAL" && segment.plannedDays.trim()
                ? Number(segment.plannedDays)
                : null,
            splitWeight: null,
            dailyRateSnapshot: bar.dailyRateSnapshot,
          };
          const segPeers = mergePeerRecordsWithAllocation(
            segRecord,
            [
              ...others,
              ...segments
                .filter((x) => x.key !== segment.key)
                .map((x) => ({
                  id: x.id ?? x.key,
                  projectId: bar.projectId,
                  userId: bar.userId,
                  startDate: toDateOnly(parseDateOnlyInput(x.startDate)),
                  endDate: toDateOnly(parseDateOnlyInput(x.endDate)),
                  allocationMode: x.allocationMode,
                  plannedDays:
                    x.allocationMode === "MANUAL" && x.plannedDays.trim()
                      ? Number(x.plannedDays)
                      : null,
                  splitWeight: null,
                  dailyRateSnapshot: bar.dailyRateSnapshot,
                })),
            ]
          );
          totalEffective += computeEffectiveDays(segRecord, segPeers);
        } catch {
          /* skip invalid draft */
        }
      }

      return {
        scheduleSpanDays,
        effectiveDays,
        calcSegments,
        overloadDays,
        totalEffective: Math.round(totalEffective * 100) / 100,
      };
    } catch {
      return null;
    }
  }, [active, bar, peerRecords, segments]);

  const activeOverlapError = useMemo(() => {
    if (!active?.startDate || !active?.endDate) return null;
    try {
      parseDateOnlyInput(active.startDate);
      parseDateOnlyInput(active.endDate);
      if (
        parseDateOnlyInput(active.startDate).getTime() >
        parseDateOnlyInput(active.endDate).getTime()
      ) {
        return "结束日期不能早于开始日期";
      }
      for (const segment of segments) {
        if (segment.key === activeKey) continue;
        if (
          dateRangesOverlap(
            active.startDate,
            active.endDate,
            segment.startDate,
            segment.endDate
          )
        ) {
          return "该分段与同项目其他排班分段时间重叠";
        }
      }
      return null;
    } catch {
      return "日期无效";
    }
  }, [active, activeKey, segments]);

  const isActiveDirty = useMemo(() => {
    if (!active) return false;
    if (!active.id) return true;
    const original = projectSegments.find((segment) => segment.id === active.id);
    if (!original) return true;
    const originalPlanned =
      original.plannedDays != null ? String(original.plannedDays) : "";
    return (
      active.startDate !== formatLocalDateInput(new Date(original.startDate)) ||
      active.endDate !== formatLocalDateInput(new Date(original.endDate)) ||
      active.allocationMode !== original.allocationMode ||
      (active.allocationMode === "MANUAL" &&
        active.plannedDays.trim() !== originalPlanned) ||
      active.notes.trim() !== (original.notes ?? "").trim()
    );
  }, [active, projectSegments]);

  if (!bar || !active) return null;

  function updateActive(patch: Partial<SegmentDraft>) {
    setSegments((prev) =>
      prev.map((s) => (s.key === activeKey ? { ...s, ...patch } : s))
    );
  }

  function addSegment() {
    const sorted = [...segments].sort(
      (a, b) =>
        parseDateOnlyInput(a.endDate).getTime() - parseDateOnlyInput(b.endDate).getTime()
    );
    const last = sorted[sorted.length - 1] ?? active;
    const dates = defaultDatesAfterLastSegment(last);
    const draft = newDraftSegment(bar!, dates);
    setSegments((prev) => [...prev, draft]);
    setActiveKey(draft.key);
  }

  function removeActive() {
    if (active.id) {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("allocationId", active.id!);
        fd.set("projectId", bar!.projectId);
        const result = await deleteProjectAllocation(fd);
        if (result.error) {
          setError(result.error);
          return;
        }
        const next = segments.filter((s) => s.key !== activeKey);
        setSegments(next);
        setActiveKey(next[0]?.key ?? "");
        onSaved?.();
        if (next.length === 0) onClose();
      });
      return;
    }

    if (segments.length <= 1) return;
    const next = segments.filter((s) => s.key !== activeKey);
    setSegments(next);
    setActiveKey(next[0]?.key ?? "");
  }

  function handleSave() {
    setError(null);
    if (activeOverlapError) {
      setError(activeOverlapError);
      return;
    }

    const fd = new FormData();
    fd.set("projectId", bar!.projectId);
    fd.set("startDate", active.startDate);
    fd.set("endDate", active.endDate);
    fd.set("allocationMode", active.allocationMode);
    if (active.allocationMode === "MANUAL") {
      fd.set("plannedDays", active.plannedDays);
    }
    fd.set("notes", active.notes);

    startTransition(async () => {
      const result = active.id
        ? await (() => {
            fd.set("allocationId", active.id!);
            return updateProjectAllocation(fd);
          })()
        : await (() => {
            fd.set("userId", bar!.userId);
            return createProjectAllocation(fd);
          })();

      if (result.error) {
        setError(result.error);
        return;
      }

      onSaved?.();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {bar.userName} · {bar.projectName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>排班分段</Label>
              {canEdit ? (
                <Button type="button" variant="outline" size="sm" onClick={addSegment}>
                  添加分段
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {segments.map((segment, index) => (
                <button
                  key={segment.key}
                  type="button"
                  onClick={() => setActiveKey(segment.key)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition-colors",
                    segment.key === activeKey
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  分段 {index + 1}
                  {segment.startDate && segment.endDate
                    ? ` · ${segment.startDate.slice(5)}~${segment.endDate.slice(5)}`
                    : ""}
                </button>
              ))}
            </div>
            {activeOverlapError ? (
              <p className="text-xs text-destructive">{activeOverlapError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                各分段日期不能重叠；保存仅提交当前分段
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-startDate" className="block min-h-5 leading-5">
                开始日期
              </Label>
              <Input
                id="edit-startDate"
                type="date"
                required
                disabled={!canEdit}
                value={active.startDate}
                onChange={(e) => updateActive({ startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-endDate" className="block min-h-5 leading-5">
                结束日期
              </Label>
              <Input
                id="edit-endDate"
                type="date"
                required
                disabled={!canEdit}
                value={active.endDate}
                onChange={(e) => updateActive({ endDate: e.target.value })}
              />
            </div>
            <SelectField
              id="edit-allocationMode"
              name="allocationMode"
              label="模式"
              value={active.allocationMode}
              disabled={!canEdit}
              onValueChange={(v) => updateActive({ allocationMode: v as AllocationMode })}
              options={(Object.keys(ALLOCATION_MODE_LABELS) as AllocationMode[]).map(
                (key) => ({ value: key, label: ALLOCATION_MODE_LABELS[key] })
              )}
            />
            {active.allocationMode === "MANUAL" ? (
              <div className="space-y-2">
                <Label htmlFor="edit-plannedDays" className="block min-h-5 leading-5">
                  锁定单日人天
                </Label>
                <Input
                  id="edit-plannedDays"
                  type="number"
                  min="0.01"
                  max="1"
                  step="0.01"
                  required
                  disabled={!canEdit}
                  value={active.plannedDays}
                  onChange={(e) => updateActive({ plannedDays: e.target.value })}
                  placeholder="如 0.4"
                />
              </div>
            ) : (
              <div className="hidden md:block" aria-hidden />
            )}
            {active.allocationMode === "MANUAL" ? (
              <p className="text-xs text-muted-foreground md:col-span-2 -mt-1">
                每天固定占用该份额；其余容量由同日自动排班项目平分
              </p>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-notes" className="block min-h-5 leading-5">
                备注
              </Label>
              <Input
                id="edit-notes"
                disabled={!canEdit}
                value={active.notes}
                onChange={(e) => updateActive({ notes: e.target.value })}
              />
            </div>
          </div>

          {preview ? (
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <p className="text-xs font-medium text-muted-foreground">当前分段</p>
              <p>
                排班跨度：<strong>{preview.scheduleSpanDays}</strong> 天
              </p>
              <p>
                本段人天：<strong>{formatPersonDays(preview.effectiveDays)}</strong>
                {active.allocationMode === "AUTO"
                  ? "（随多项目自动拆分）"
                  : "（按锁定单日人天累计）"}
              </p>
              {preview.calcSegments.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs">
                  {preview.calcSegments.map((seg) => (
                    <li key={`${formatLocalDateInput(seg.startDate)}-${seg.dailyShare}`}>
                      <span className="font-medium">
                        {formatDateRangeLabel(seg.startDate, seg.endDate)}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · 每天 {formatDailyShareLabel(seg.dailyShare)} × {seg.workdays} 天 ={" "}
                      </span>
                      <strong>{formatPersonDays(seg.subtotal)}</strong>
                      <span className="text-muted-foreground"> 人天</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {segments.length > 1 ? (
                <p className="border-t border-border/60 pt-2">
                  全部分段合计：<strong>{formatPersonDays(preview.totalEffective)}</strong> 人天
                </p>
              ) : null}
              {preview.overloadDays > 0 ? (
                <p className="text-destructive">
                  该分段内有 {preview.overloadDays} 天投入份额超过 100%
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {canEdit ? (
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={pending || (!active.id && segments.length <= 1)}
                onClick={removeActive}
              >
                删除本段
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={pending || !!activeOverlapError || !isActiveDirty}
                  onClick={handleSave}
                >
                  {pending ? "保存中…" : "保存本段"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                关闭
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
