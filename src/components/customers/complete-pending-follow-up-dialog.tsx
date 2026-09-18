"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PendingFollowPlanItem } from "@/components/customers/pending-follow-plan-item";
import { pendingPlanSelectionKey } from "@/lib/follow-ups/unified";
import type { SerializedCustomerPendingFollowPlan } from "@/lib/follow-ups/unified";
import type { PendingAssignmentForFollowUp } from "@/lib/today-work/assignment-follow-up-complete";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export type AssignmentCompletionMode = "complete" | "skip" | null;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 未完成指派任务 */
  assignments?: PendingAssignmentForFollowUp[];
  assignmentMode: AssignmentCompletionMode;
  onAssignmentModeChange: (mode: AssignmentCompletionMode) => void;
  selectedAssignmentIds: string[];
  onSelectedAssignmentIdsChange: (ids: string[]) => void;
  /** 其他待跟进计划（不含已作为任务锚点的也可仍展示） */
  planItems: SerializedCustomerPendingFollowPlan[];
  selectedPlanKeys: string[];
  onSelectedPlanKeysChange: (keys: string[]) => void;
  onConfirm: () => void;
  pending?: boolean;
};

export function planSelectionKey(item: SerializedCustomerPendingFollowPlan) {
  return pendingPlanSelectionKey(item.source, item.id);
}

export function CompletePendingFollowUpDialog({
  open,
  onOpenChange,
  assignments = [],
  assignmentMode,
  onAssignmentModeChange,
  selectedAssignmentIds,
  onSelectedAssignmentIdsChange,
  planItems,
  selectedPlanKeys,
  onSelectedPlanKeysChange,
  onConfirm,
  pending,
}: Props) {
  const hasAssignments = assignments.length > 0;
  const hasPlans = planItems.length > 0;

  function toggleAssignment(id: string) {
    if (selectedAssignmentIds.includes(id)) {
      onSelectedAssignmentIdsChange(selectedAssignmentIds.filter((x) => x !== id));
      return;
    }
    onSelectedAssignmentIdsChange([...selectedAssignmentIds, id]);
  }

  function togglePlanKey(key: string) {
    if (selectedPlanKeys.includes(key)) {
      onSelectedPlanKeysChange(selectedPlanKeys.filter((item) => item !== key));
      return;
    }
    onSelectedPlanKeysChange([...selectedPlanKeys, key]);
  }

  const assignmentOk =
    !hasAssignments ||
    assignmentMode === "skip" ||
    (assignmentMode === "complete" && selectedAssignmentIds.length > 0);
  const plansOk = !hasPlans || selectedPlanKeys.length > 0 || hasAssignments;
  // 仅有计划、无任务：必须选计划；有任务时任务区已二选一即可，计划可选
  const canConfirm =
    assignmentOk && (hasAssignments ? true : plansOk) && (hasAssignments || hasPlans);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {hasAssignments ? "确认是否完成指派任务" : "选择要完成的待跟进计划"}
          </DialogTitle>
          <DialogDescription>
            {hasAssignments
              ? "检测到该客户/商机仍有未完成的指派任务。请选择本次是否一并完成；必须二选一后才能提交往来。"
              : `该客户仍有 ${planItems.length} 条待跟进计划，请选择本次跟进对应完成的一条或多条。`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(60vh,28rem)] space-y-4 overflow-y-auto pr-1">
          {hasAssignments ? (
            <section className="space-y-3">
              <p className="text-sm font-medium">未完成指派任务（{assignments.length}）</p>
              <div className="space-y-2">
                <label
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3",
                    assignmentMode === "complete" && "border-primary bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    checked={assignmentMode === "complete"}
                    onChange={() => {
                      onAssignmentModeChange("complete");
                      if (selectedAssignmentIds.length === 0) {
                        onSelectedAssignmentIdsChange(assignments.map((a) => a.id));
                      }
                    }}
                  />
                  <span className="text-sm">完成所选任务</span>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3",
                    assignmentMode === "skip" && "border-primary bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    checked={assignmentMode === "skip"}
                    onChange={() => onAssignmentModeChange("skip")}
                  />
                  <span className="text-sm">本次不完成任务（仅记往来）</span>
                </label>
              </div>
              {assignmentMode === "complete" ? (
                <div className="space-y-2 pl-1">
                  {assignments.map((row) => (
                    <label
                      key={row.id}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-md border p-3",
                        selectedAssignmentIds.includes(row.id) && "border-primary bg-primary/5"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={selectedAssignmentIds.includes(row.id)}
                        onChange={() => toggleAssignment(row.id)}
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">{row.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          截止 {format(new Date(row.dueAt), "yyyy-MM-dd HH:mm")}
                          {row.opportunityTitle ? ` · 商机：${row.opportunityTitle}` : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {hasPlans ? (
            <section className="space-y-2">
              <p className="text-sm font-medium">
                其他待跟进计划（{planItems.length}）
                {hasAssignments ? <span className="font-normal text-muted-foreground"> · 可选</span> : null}
              </p>
              {planItems.map((item) => {
                const key = planSelectionKey(item);
                return (
                  <PendingFollowPlanItem
                    key={key}
                    item={item}
                    selectable
                    multiple
                    selected={selectedPlanKeys.includes(key)}
                    onSelect={() => togglePlanKey(key)}
                  />
                );
              })}
            </section>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {hasAssignments
              ? assignmentMode == null
                ? "请先选择是否完成任务"
                : assignmentMode === "complete"
                  ? `将完成 ${selectedAssignmentIds.length} 项任务`
                  : "本次不完成任务"
              : `已选计划 ${selectedPlanKeys.length} 条`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              返回修改
            </Button>
            <Button type="button" onClick={onConfirm} disabled={pending || !canConfirm}>
              {pending ? "保存中…" : "确认并提交"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
