"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/opportunities/funnel";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
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

export function ScheduleProjectCards({ projects, periodLabel, onSelectProject }: Props) {
  if (projects.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">暂无可见项目</p>
    );
  }

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => onSelectProject(project.id)}
          className={cn(
            "rounded-xl border bg-card p-4 text-left shadow-sm transition-colors",
            "hover:border-primary/40 hover:bg-primary/[0.02]"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{project.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground truncate">
                {project.customerName}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </div>

          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p>项目经理：{project.projectManagerName ?? "未指定"}</p>
            <p>
              计划周期：{formatOptionalDate(project.plannedStartAt)} –{" "}
              {formatOptionalDate(project.plannedEndAt)}
            </p>
            <p>进度：{project.progressPercent}%</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t pt-3 text-xs">
            <span>
              <span className="text-muted-foreground">{periodLabel}投入：</span>
              <span className="font-medium text-foreground">
                {project.periodEffectiveDays} 人天
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">人员：</span>
              <span className="font-medium text-foreground">{project.periodStaffCount} 人</span>
            </span>
            <span>
              <span className="text-muted-foreground">成本：</span>
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
