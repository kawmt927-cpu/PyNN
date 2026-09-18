"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/opportunities/funnel";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
import { useStaffColor } from "@/lib/projects/timeline-colors";
import type { ScheduleProjectOption } from "@/lib/projects/schedule-serialize";

type Props = {
  projects: ScheduleProjectOption[];
  periodLabel: string;
  onSelectProject: (projectId: string) => void;
};

function formatOptionalDate(value: string | null) {
  if (!value) return "—";
  return format(new Date(value), "yyyy-MM-dd", { locale: zhCN });
}

function PeriodStaffChip({ userId, name }: { userId: string; name: string }) {
  const color = useStaffColor(userId);
  return (
    <span
      title={name}
      className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="max-w-[4.5rem] truncate">{name}</span>
    </span>
  );
}

export function ScheduleProjectCards({ projects, periodLabel, onSelectProject }: Props) {
  if (projects.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">暂无可见项目</p>
    );
  }

  return (
    <div className="grid auto-rows-fr gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => onSelectProject(project.id)}
          className={cn(
            "flex h-full flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-colors",
            "hover:border-primary/40 hover:bg-primary/[0.02]"
          )}
        >
          {/* 表头：固定两行高度（客户名与项目名相同时只显示一行） */}
          <div className="flex h-11 shrink-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-5">{project.name}</p>
              {project.customerName.trim() !== project.name.trim() ? (
                <p className="mt-0.5 truncate text-sm leading-5 text-muted-foreground">
                  {project.customerName}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium leading-5">
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </div>

          {/* 明细：固定三行，防换行撑高 */}
          <div className="mt-3 shrink-0 space-y-1.5 text-xs leading-4 text-muted-foreground">
            <p className="truncate">
              项目经理：{project.projectManagerName ?? "未指定"}
            </p>
            <p
              className="truncate"
              title={`计划周期：${formatOptionalDate(project.plannedStartAt)} – ${formatOptionalDate(project.plannedEndAt)}`}
            >
              计划周期：{formatOptionalDate(project.plannedStartAt)} –{" "}
              {formatOptionalDate(project.plannedEndAt)}
            </p>
            <p className="truncate">进度：{project.progressPercent}%</p>
          </div>

          {/* 人员条：预留固定高度，多出省略 */}
          <div className="mt-3 flex h-7 shrink-0 flex-wrap content-start gap-1.5 overflow-hidden">
            {project.periodStaff.length > 0 ? (
              project.periodStaff.map(({ userId, name }) => (
                <PeriodStaffChip key={userId} userId={userId} name={name} />
              ))
            ) : (
              <span className="text-[10px] leading-7 text-muted-foreground/60">
                {periodLabel}暂无人员投入
              </span>
            )}
          </div>

          {/* 底部指标：始终贴底对齐 */}
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-xs">
            <span>
              <span className="text-muted-foreground">{periodLabel}投入：</span>
              <span className="font-medium text-foreground">
                {project.periodEffectiveDays} 人天
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">人员：</span>
              <span className="font-medium text-foreground">
                {project.periodStaffCount} 人
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">{periodLabel}成本：</span>
              <span className="font-medium text-foreground">
                {formatAmount(project.periodCost)}
              </span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
