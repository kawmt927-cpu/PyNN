"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScheduleStaff } from "@/lib/projects/schedule-serialize";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
import type { PersonnelType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/opportunities/funnel";
import { useStaffColor } from "@/lib/projects/timeline-colors";

type Props = {
  open: boolean;
  projectName: string;
  poolStaff: ScheduleStaff[];
  /** 已在本项目甘特中的人员，置底或标注「已在项目」 */
  existingUserIds: string[];
  onClose: () => void;
  onSelect: (staff: ScheduleStaff) => void;
};

function PoolStaffRow({
  member,
  alreadyOnProject,
  onPick,
}: {
  member: ScheduleStaff;
  alreadyOnProject: boolean;
  onPick: () => void;
}) {
  const color = useStaffColor(member.id);
  const typeLabel = member.personnelType
    ? PERSONNEL_TYPE_LABELS[member.personnelType as PersonnelType] ?? member.personnelType
    : null;
  const projectsLabel =
    member.activeProjectNames.length > 0
      ? member.activeProjectNames.join("、")
      : "本周期无其他项目";

  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
        "hover:border-primary/40 hover:bg-primary/5",
        alreadyOnProject && "opacity-70"
      )}
    >
      <span
        className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{member.name}</span>
          {typeLabel ? (
            <span className="text-[10px] text-muted-foreground">{typeLabel}</span>
          ) : null}
          {alreadyOnProject ? (
            <span className="text-[10px] text-muted-foreground">已在本项目 · 可再增时段</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {member.dailyRate != null ? `${formatAmount(member.dailyRate)}/天` : "未设日单价"}
          {" · "}
          {projectsLabel}
        </p>
      </div>
    </button>
  );
}

/** 从总资源池选人后交给排班编辑弹窗设时段 */
export function AddAllocationPickerDialog({
  open,
  projectName,
  poolStaff,
  existingUserIds,
  onClose,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const existing = useMemo(() => new Set(existingUserIds), [existingUserIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = poolStaff.filter((s) => !s.resigned);
    const matched = q
      ? list.filter((s) => s.name.toLowerCase().includes(q))
      : list;
    return matched.sort((a, b) => {
      const ae = existing.has(a.id) ? 1 : 0;
      const be = existing.has(b.id) ? 1 : 0;
      if (ae !== be) return ae - be;
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [poolStaff, search, existing]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearch("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>添加投入 · {projectName}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          从资源池选择人员，确认后设置投入时间段。
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="add-alloc-search">搜索</Label>
          <Input
            id="add-alloc-search"
            placeholder="姓名…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-0.5">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">无匹配人员</p>
          ) : (
            filtered.map((member) => (
              <PoolStaffRow
                key={member.id}
                member={member}
                alreadyOnProject={existing.has(member.id)}
                onPick={() => {
                  setSearch("");
                  onSelect(member);
                }}
              />
            ))
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
