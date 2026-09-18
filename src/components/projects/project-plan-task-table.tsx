"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Upload, Trash2 } from "lucide-react";
import { ProjectTaskStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToneSelect } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { countWorkdays, toDateOnly } from "@/lib/projects/workdays";
import { resolveTaskProgressPercent } from "@/lib/projects/task-progress";
import { PROJECT_TASK_STATUS_LABELS, PROJECT_TASK_STATUS_BADGE_CLASS, PROJECT_TASK_PROGRESS_FILL_CLASS } from "@/lib/projects/labels";
import {
  batchDeleteProjectTasks,
  batchUpdateProjectTasks,
  deleteEmptyProjectPhases,
  importProjectTasks,
} from "@/app/(dashboard)/projects/project-plan-actions";
import type { PlanPhase, PlanTask } from "@/components/projects/project-plan-types";
import { usePropagateWheelAtEdge } from "@/hooks/use-propagate-wheel-at-edge";

type FlatRow =
  | {
      kind: "task";
      phaseId: string;
      phaseName: string;
      seq: number;
      task: PlanTask;
    }
  | {
      kind: "empty-phase";
      phaseId: string;
      phaseName: string;
      plannedStartAt: Date | null;
      plannedEndAt: Date | null;
    };

type Props = {
  projectId: string;
  canEdit: boolean;
  phases: PlanPhase[];
  assignees: Array<{ id: string; name: string }>;
  selectedTaskId: string | null;
  selectedPhaseId: string | null;
  onSelectTask: (taskId: string | null) => void;
  onSelectPhase: (phaseId: string) => void;
  onEditTask: (taskId: string) => void;
  onAddTask: (phaseId: string) => void;
  onDeletePhase?: (phase: PlanPhase) => void;
  /** 未填计划起止时拦截导入导出等操作 */
  runWithPlannedWindow?: (action: () => void) => void;
  onError?: (message: string | null) => void;
  onWarning?: (message: string | null) => void;
  onRefresh?: () => void;
};

const STATUS_OPTIONS = (Object.keys(PROJECT_TASK_STATUS_LABELS) as ProjectTaskStatus[]).map(
  (status) => ({
    value: status,
    label: PROJECT_TASK_STATUS_LABELS[status],
  })
);

function sortByOrder<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
}

async function downloadPlanTasksWorkbook(input: {
  filename: string;
  phaseNames: string[];
  taskHeaders: string[];
  taskRows: Array<Array<string | number>>;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const taskSheet = wb.addWorksheet("任务明细");
  taskSheet.addRow(input.taskHeaders);
  for (const row of input.taskRows) taskSheet.addRow(row);
  taskSheet.getRow(1).font = { bold: true };

  const phaseSheet = wb.addWorksheet("阶段");
  phaseSheet.addRow(["阶段"]);
  phaseSheet.getRow(1).font = { bold: true };
  for (const name of input.phaseNames) phaseSheet.addRow([name]);

  const statusSheet = wb.addWorksheet("状态");
  statusSheet.addRow(["状态"]);
  statusSheet.getRow(1).font = { bold: true };
  for (const label of Object.values(PROJECT_TASK_STATUS_LABELS)) {
    statusSheet.addRow([label]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return formatLocalDateInput(value);
  if (typeof value === "object" && value !== null && "richText" in value) {
    const parts = (value as { richText?: Array<{ text?: string }> }).richText ?? [];
    return parts.map((part) => String(part.text ?? "")).join("").trim();
  }
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text?: unknown }).text ?? "").trim();
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellText((value as { result?: unknown }).result);
  }
  return String(value).trim();
}

function normalizeHeader(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

/** Excel 百分比单元格常为 0~1；也兼容直接填 0~100 */
function normalizeProgressPercent(raw: unknown, numFmt?: string): number | null {
  if (raw == null || raw === "") return null;
  const asText = String(raw).trim().replace(/%$/, "");
  const n = typeof raw === "number" ? raw : Number(asText);
  if (!Number.isFinite(n)) return null;
  const looksPercentFraction =
    (typeof numFmt === "string" && numFmt.includes("%")) || (n > 0 && n <= 1);
  const percent = looksPercentFraction ? Math.round(n * 100) : Math.round(n);
  return Math.min(100, Math.max(0, percent));
}

/** 从「任务明细」表头解析列下标；兼容旧模板固定列序 */
function resolveTaskSheetColumns(headerCells: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerCells.forEach((raw, index) => {
    const h = normalizeHeader(raw);
    if (!h) return;
    if (h === "阶段") map.phase = index;
    else if (h === "序号") map.seq = index;
    else if (h === "任务名称" || h === "名称") map.name = index;
    else if (h === "任务要求" || h === "说明" || h === "描述") map.description = index;
    else if (h === "工作日" || h.includes("工作日")) map.workdays = index;
    else if (h === "计划开始" || h === "开始日期" || h === "开始") map.start = index;
    else if (h === "计划结束" || h === "结束日期" || h === "结束") map.end = index;
    else if (h === "工作状态" || h === "状态") map.status = index;
    else if (h === "完成情况" || h === "完成进度" || h === "进度") map.progress = index;
    else if (h === "负责人") map.assignee = index;
    else if (h === "备注") map.note = index;
  });
  return map;
}

export function ProjectPlanTaskTable({
  projectId,
  canEdit,
  phases,
  assignees,
  selectedTaskId,
  selectedPhaseId,
  onSelectTask,
  onSelectPhase,
  onEditTask,
  onAddTask,
  onDeletePhase,
  runWithPlannedWindow,
  onError,
  onWarning,
  onRefresh,
}: Props) {
  const guard = (action: () => void) => {
    if (runWithPlannedWindow) runWithPlannedWindow(action);
    else action();
  };
  const [pending, startTransition] = useTransition();
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string>("");
  const [batchAssignee, setBatchAssignee] = useState<string>("");
  const [batchStart, setBatchStart] = useState("");
  const [batchEnd, setBatchEnd] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const tablePaneRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  usePropagateWheelAtEdge(tablePaneRef);

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    for (const phase of sortByOrder(phases)) {
      const tasks = sortByOrder(phase.tasks);
      if (tasks.length === 0) {
        rows.push({
          kind: "empty-phase",
          phaseId: phase.id,
          phaseName: phase.name,
          plannedStartAt: phase.plannedStartAt,
          plannedEndAt: phase.plannedEndAt,
        });
        continue;
      }
      let seq = 1;
      for (const task of tasks) {
        rows.push({
          kind: "task",
          phaseId: phase.id,
          phaseName: phase.name,
          seq: seq++,
          task,
        });
      }
    }
    return rows;
  }, [phases]);

  const filtered = useMemo(() => {
    return flatRows.filter((row) => {
      if (phaseFilter !== "all" && row.phaseId !== phaseFilter) return false;
      if (row.kind === "empty-phase") {
        // 按状态筛选时不展示空阶段行
        return statusFilter === "all";
      }
      if (statusFilter !== "all" && row.task.status !== statusFilter) return false;
      return true;
    });
  }, [flatRows, phaseFilter, statusFilter]);

  const taskRows = useMemo(
    () => filtered.filter((row): row is Extract<FlatRow, { kind: "task" }> => row.kind === "task"),
    [filtered]
  );
  const emptyPhaseCount = useMemo(
    () => phases.filter((p) => p.tasks.length === 0).length,
    [phases]
  );

  useEffect(() => {
    if (!selectedTaskId) return;
    const el = rowRefs.current.get(selectedTaskId);
    if (!el) return;
    const pane = tablePaneRef.current;
    if (pane) {
      const er = el.getBoundingClientRect();
      const pr = pane.getBoundingClientRect();
      // 已在可视区内（如表内点击）则不再滚动，避免平滑滚动造成的迟滞感
      if (er.top >= pr.top && er.bottom <= pr.bottom) return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [selectedTaskId]);

  function toggleSelect(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === taskRows.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(taskRows.map((r) => r.task.id)));
  }

  function handleExport() {
    const headers = [
      "阶段",
      "序号",
      "任务名称",
      "任务要求",
      "工作日",
      "计划开始",
      "计划结束",
      "工作状态",
      "完成进度",
      "负责人",
      "备注",
    ];
    const rows = taskRows.map((row) => {
      const workdays = countWorkdays(
        toDateOnly(row.task.plannedStartAt),
        toDateOnly(row.task.plannedEndAt)
      );
      return [
        row.phaseName,
        row.seq,
        row.task.name,
        row.task.description ?? "",
        workdays,
        formatLocalDateInput(row.task.plannedStartAt),
        formatLocalDateInput(row.task.plannedEndAt),
        PROJECT_TASK_STATUS_LABELS[row.task.status],
        resolveTaskProgressPercent(row.task),
        row.task.assigneeName ?? "",
        row.task.cancelledNote ?? "",
      ];
    });
    void downloadPlanTasksWorkbook({
      filename: "项目任务导出.xlsx",
      phaseNames: sortByOrder(phases).map((p) => p.name),
      taskHeaders: headers,
      taskRows: rows,
    });
  }

  function handleCleanupEmptyPhases() {
    if (emptyPhaseCount === 0) return;
    const ok = window.confirm(
      `将删除 ${emptyPhaseCount} 个无任务的空阶段（甘特图中对应行也会消失）。是否继续？`
    );
    if (!ok) return;
    onError?.(null);
    onWarning?.(null);
    startTransition(async () => {
      const result = await deleteEmptyProjectPhases({ projectId });
      if (result.error) {
        onError?.(result.error);
        return;
      }
      if (result.warning) onWarning?.(result.warning);
      onRefresh?.();
    });
  }

  function handleDownloadTemplate() {
    const headers = [
      "阶段",
      "任务名称",
      "任务要求",
      "计划开始",
      "计划结束",
      "工作状态",
      "完成进度",
    ];
    const samplePhase = phases[0]?.name ?? "示例阶段";
    const today = formatLocalDateInput(new Date());
    void downloadPlanTasksWorkbook({
      filename: "项目任务导入模板.xlsx",
      phaseNames:
        phases.length > 0 ? sortByOrder(phases).map((p) => p.name) : [samplePhase],
      taskHeaders: headers,
      taskRows: [
        [samplePhase, "示例任务", "任务说明（可选）", today, today, "未开始", 0],
      ],
    });
  }

  async function handleImportFile(file: File) {
    onError?.(null);
    onWarning?.(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws =
        wb.getWorksheet("任务明细") ??
        wb.worksheets.find((sheet) => sheet.name.includes("任务")) ??
        wb.worksheets[0];
      if (!ws) {
        onError?.("Excel 中没有「任务明细」工作表");
        return;
      }

      const statusByLabel = Object.fromEntries(
        Object.entries(PROJECT_TASK_STATUS_LABELS).map(([k, v]) => [v, k])
      ) as Record<string, ProjectTaskStatus>;

      const headerRow = ws.getRow(1);
      const headerCells: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headerCells[colNumber - 1] = cellText(cell.value ?? cell.text);
      });
      const cols = resolveTaskSheetColumns(headerCells);
      const useHeaderMap = cols.phase != null && cols.name != null;
      // 兼容旧模板：阶段、任务名称、任务要求、计划开始、计划结束、工作状态、进度
      const fallback = {
        phase: 0,
        name: 1,
        description: 2,
        start: 3,
        end: 4,
        status: 5,
        progress: 6,
      };
      const col = useHeaderMap ? cols : fallback;

      const rows: Array<{
        phaseName: string;
        name: string;
        description?: string;
        plannedStartAt: string;
        plannedEndAt: string;
        status?: ProjectTaskStatus;
        progressPercent?: number | null;
      }> = [];
      const skipNotes: string[] = [];
      const softWarnings: string[] = [];
      let lastPhaseName = "";

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const get = (key: keyof typeof fallback) => {
          const idx = col[key];
          if (idx == null) return "";
          return cellText(row.getCell(idx + 1).value ?? row.getCell(idx + 1).text);
        };
        let phaseName = get("phase");
        if (!phaseName && lastPhaseName) phaseName = lastPhaseName;
        const name = get("name");
        if (!name) return;
        if (!phaseName) {
          skipNotes.push(`第 ${rowNumber} 行：缺少阶段，已跳过`);
          return;
        }
        lastPhaseName = phaseName;

        const plannedStartAt = get("start").slice(0, 10);
        const plannedEndAt = get("end").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedStartAt) || !/^\d{4}-\d{2}-\d{2}$/.test(plannedEndAt)) {
          skipNotes.push(
            `第 ${rowNumber} 行「${name}」：缺少有效计划起止日期，已跳过`
          );
          return;
        }

        const description = get("description") || undefined;
        const statusLabel = get("status");
        const status = statusLabel ? statusByLabel[statusLabel] : undefined;
        if (statusLabel && !status) {
          softWarnings.push(
            `第 ${rowNumber} 行「${name}」：状态「${statusLabel}」不支持，已按「未开始」导入`
          );
        }

        const progressCell =
          col.progress != null ? row.getCell(col.progress + 1) : null;
        const progressPercent = normalizeProgressPercent(
          progressCell?.value ?? null,
          typeof progressCell?.numFmt === "string" ? progressCell.numFmt : undefined
        );

        rows.push({
          phaseName,
          name,
          description,
          plannedStartAt,
          plannedEndAt,
          status,
          progressPercent,
        });
      });

      if (rows.length === 0) {
        onError?.(
          skipNotes[0] ??
            "没有可导入的数据行（请确认「任务明细」含【阶段】【任务名称】【计划开始】【计划结束】）"
        );
        return;
      }

      const phaseCount = new Set(rows.map((r) => r.phaseName)).size;
      const ok = window.confirm(
        `导入将整体覆盖本项目现有阶段与任务明细（甘特图一并替换）。\n\n本次将导入 ${phaseCount} 个阶段、${rows.length} 条任务。是否继续？`
      );
      if (!ok) return;

      const clientWarning = [
        skipNotes.length > 0
          ? `已跳过 ${skipNotes.length} 行（如阶段小结无日期）。${skipNotes.slice(0, 3).join("；")}${
              skipNotes.length > 3 ? "…" : ""
            }`
          : null,
        softWarnings.length > 0
          ? `${softWarnings.slice(0, 3).join("；")}${softWarnings.length > 3 ? "…" : ""}`
          : null,
      ]
        .filter(Boolean)
        .join(" ");

      startTransition(async () => {
        const result = await importProjectTasks({ projectId, rows });
        if (result.error) {
          onError?.(result.error);
          return;
        }
        const warning = [clientWarning || null, result.warning || null]
          .filter(Boolean)
          .join(" ");
        if (warning) onWarning?.(warning);
        onRefresh?.();
      });
    } catch {
      onError?.("解析 Excel 失败，请使用「下载模板」生成的 .xlsx 格式");
    }
  }

  function handleBatchSave() {
    const taskIds = [...selectedIds];
    if (taskIds.length === 0) return;
    onError?.(null);
    onWarning?.(null);
    startTransition(async () => {
      const result = await batchUpdateProjectTasks({
        projectId,
        taskIds,
        ...(batchStatus ? { status: batchStatus as ProjectTaskStatus } : {}),
        ...(batchAssignee
          ? { assigneeId: batchAssignee === "__none__" ? null : batchAssignee }
          : {}),
        ...(batchStart ? { plannedStartAt: batchStart } : {}),
        ...(batchEnd ? { plannedEndAt: batchEnd } : {}),
      });
      if (result.error) {
        onError?.(result.error);
        return;
      }
      if (result.warning) onWarning?.(result.warning);
      setBatchOpen(false);
      setSelectedIds(new Set());
      onRefresh?.();
    });
  }

  function handleBatchDelete() {
    const taskIds = [...selectedIds];
    if (taskIds.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${taskIds.length} 个任务？`)) return;
    onError?.(null);
    startTransition(async () => {
      const result = await batchDeleteProjectTasks({ projectId, taskIds });
      if (result.error) {
        onError?.(result.error);
        return;
      }
      setSelectedIds(new Set());
      onRefresh?.();
    });
  }

  const phaseOptions = [
    { value: "all", label: "全部阶段" },
    ...sortByOrder(phases).map((p) => ({ value: p.id, label: p.name })),
  ];
  const statusFilterOptions = [
    { value: "all", label: "全部状态" },
    ...STATUS_OPTIONS,
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[10rem]">
          <ToneSelect
            size="sm"
            value={phaseFilter}
            onValueChange={setPhaseFilter}
            options={phaseOptions}
          />
        </div>
        <div className="w-[8rem]">
          <ToneSelect
            size="sm"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={statusFilterOptions}
          />
        </div>
        {canEdit ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!selectedPhaseId && phases.length === 0}
              onClick={() => {
                guard(() => {
                  const phaseId = selectedPhaseId ?? phases[0]?.id;
                  if (phaseId) onAddTask(phaseId);
                });
              }}
            >
              添加任务
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={selectedIds.size === 0 || pending}
              onClick={() => guard(() => setBatchOpen(true))}
            >
              批量编辑 ({selectedIds.size})
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-destructive"
              disabled={selectedIds.size === 0 || pending}
              onClick={() => guard(() => handleBatchDelete())}
            >
              <Trash2 className="h-3.5 w-3.5" />
              批量删除
            </Button>
            {emptyPhaseCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-destructive"
                disabled={pending}
                title="删除没有子任务的空阶段"
                onClick={() => guard(() => handleCleanupEmptyPhases())}
              >
                <Trash2 className="h-3.5 w-3.5" />
                清理空阶段 ({emptyPhaseCount})
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => guard(() => handleDownloadTemplate())}
            >
              <Download className="h-3.5 w-3.5" />
              Excel 模板
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={pending}
              title="整体覆盖本项目阶段与任务（非追加）"
              onClick={() => guard(() => fileRef.current?.click())}
            >
              <Upload className="h-3.5 w-3.5" />
              导入 Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleImportFile(file);
              }}
            />
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={() => guard(() => handleExport())}
          disabled={taskRows.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          导出 Excel
        </Button>
      </div>

      <div
        ref={tablePaneRef}
        className="max-h-[min(48vh,520px)] overflow-auto rounded-md border"
      >
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 z-[1] bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
            <tr className="border-b">
              {canEdit ? (
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={taskRows.length > 0 && selectedIds.size === taskRows.length}
                    onChange={toggleSelectAll}
                  />
                </th>
              ) : null}
              <th className="px-2 py-2">阶段</th>
              <th className="px-2 py-2">序号</th>
              <th className="px-2 py-2">任务名称</th>
              <th className="px-2 py-2">任务要求</th>
              <th className="px-2 py-2">工作日</th>
              <th className="px-2 py-2">计划开始</th>
              <th className="px-2 py-2">计划结束</th>
              <th className="px-2 py-2">工作状态</th>
              <th className="px-2 py-2">完成进度</th>
              <th className="px-2 py-2">备注</th>
              {canEdit ? <th className="px-2 py-2">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 12 : 10}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {phases.length === 0 ? "暂无阶段与任务" : "暂无匹配的任务"}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                if (row.kind === "empty-phase") {
                  const phase = phases.find((p) => p.id === row.phaseId);
                  const selected = selectedPhaseId === row.phaseId;
                  return (
                    <tr
                      key={`phase-${row.phaseId}`}
                      className={cn(
                        "cursor-pointer border-b",
                        selected
                          ? "bg-primary/15 shadow-[inset_3px_0_0_0] shadow-primary hover:bg-primary/20 dark:bg-primary/25 dark:hover:bg-primary/30"
                          : "bg-muted/30 hover:bg-muted/50"
                      )}
                      onClick={() => {
                        onSelectPhase(row.phaseId);
                        onSelectTask(null);
                      }}
                    >
                      {canEdit ? <td className="px-2 py-1.5" /> : null}
                      <td className="max-w-[8rem] truncate px-2 py-1.5 font-medium">
                        {row.phaseName}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">—</td>
                      <td
                        className="px-2 py-1.5 text-muted-foreground"
                        colSpan={8}
                      >
                        暂无任务
                        {row.plannedStartAt && row.plannedEndAt
                          ? `（阶段计划 ${formatLocalDateInput(row.plannedStartAt)} ~ ${formatLocalDateInput(row.plannedEndAt)}）`
                          : ""}
                      </td>
                      {canEdit ? (
                        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => onAddTask(row.phaseId)}
                            >
                              添加
                            </Button>
                            {phase && onDeletePhase ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-destructive"
                                onClick={() => onDeletePhase(phase)}
                              >
                                删除阶段
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                }

                const selected = selectedTaskId === row.task.id;
                const workdays = countWorkdays(
                  toDateOnly(row.task.plannedStartAt),
                  toDateOnly(row.task.plannedEndAt)
                );
                return (
                  <tr
                    key={row.task.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.task.id, el);
                      else rowRefs.current.delete(row.task.id);
                    }}
                    className={cn(
                      "cursor-pointer border-b",
                      selected
                        ? "bg-primary/15 shadow-[inset_3px_0_0_0] shadow-primary hover:bg-primary/20 dark:bg-primary/25 dark:hover:bg-primary/30"
                        : "hover:bg-muted/40"
                    )}
                    onClick={() => {
                      onSelectPhase(row.phaseId);
                      onSelectTask(row.task.id);
                    }}
                  >
                    {canEdit ? (
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.task.id)}
                          onChange={() => toggleSelect(row.task.id)}
                        />
                      </td>
                    ) : null}
                    <td className="max-w-[8rem] truncate px-2 py-1.5">{row.phaseName}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.seq}</td>
                    <td className="max-w-[12rem] truncate px-2 py-1.5 font-medium">
                      <span className={cn(selected && "text-primary")}>{row.task.name}</span>
                    </td>
                    <td className="max-w-[14rem] truncate px-2 py-1.5 text-muted-foreground">
                      {row.task.description || "—"}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{workdays}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {formatLocalDateInput(row.task.plannedStartAt)}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {formatLocalDateInput(row.task.plannedEndAt)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          PROJECT_TASK_STATUS_BADGE_CLASS[row.task.status]
                        )}
                      >
                        {PROJECT_TASK_STATUS_LABELS[row.task.status]}
                      </span>
                    </td>
                    <td className="min-w-[7rem] px-2 py-1.5">
                      {(() => {
                        const progress = resolveTaskProgressPercent(row.task);
                        return (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 min-w-[3.5rem] flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  PROJECT_TASK_PROGRESS_FILL_CLASS[row.task.status]
                                )}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                              {progress}%
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="max-w-[8rem] truncate px-2 py-1.5 text-muted-foreground">
                      {row.task.assigneeName
                        ? `负责人：${row.task.assigneeName}`
                        : row.task.cancelledNote || "—"}
                    </td>
                    {canEdit ? (
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => onEditTask(row.task.id)}
                        >
                          编辑
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量编辑任务</DialogTitle>
            <DialogDescription>
              已选 {selectedIds.size} 个任务。留空的字段不会修改。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">工作状态</p>
              <ToneSelect
                size="sm"
                value={batchStatus || "__keep__"}
                onValueChange={(v) => setBatchStatus(v === "__keep__" ? "" : v)}
                options={[{ value: "__keep__", label: "不修改" }, ...STATUS_OPTIONS]}
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">负责人</p>
              <ToneSelect
                size="sm"
                value={batchAssignee || "__keep__"}
                onValueChange={(v) => setBatchAssignee(v === "__keep__" ? "" : v)}
                options={[
                  { value: "__keep__", label: "不修改" },
                  { value: "__none__", label: "清空负责人" },
                  ...assignees.map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">计划开始</p>
                <Input
                  type="date"
                  value={batchStart}
                  onChange={(e) => setBatchStart(e.target.value)}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">计划结束</p>
                <Input
                  type="date"
                  value={batchEnd}
                  onChange={(e) => setBatchEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBatchOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={pending} onClick={handleBatchSave}>
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
