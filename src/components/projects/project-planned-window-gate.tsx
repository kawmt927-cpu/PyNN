"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const PROJECT_PLANNED_WINDOW_GATE_MESSAGE =
  "请先在概览标签填写项目计划开始时间与计划结束时间，才能执行当前操作";

type DialogProps = {
  open: boolean;
  onCancel: () => void;
  onGoFill: () => void;
};

/** 计划起止未填时的统一拦截弹窗 */
export function ProjectPlannedWindowGateDialog({
  open,
  onCancel,
  onGoFill,
}: DialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-w-md" showCloseButton closeOnOutsideClick>
        <DialogHeader>
          <DialogTitle>请先完成概览设置</DialogTitle>
          <DialogDescription>{PROJECT_PLANNED_WINDOW_GATE_MESSAGE}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="button" onClick={onGoFill}>
            去填写
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 计划起止为空时拦截操作；「去填写」跳转概览标签。
 */
export function useProjectPlannedWindowGate(
  hasPlannedWindow: boolean,
  projectId: string
) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const runWithPlannedWindow = useCallback(
    (action: () => void) => {
      if (hasPlannedWindow) {
        action();
        return;
      }
      setOpen(true);
    },
    [hasPlannedWindow]
  );

  const openGate = useCallback(() => setOpen(true), []);

  const dialog = (
    <ProjectPlannedWindowGateDialog
      open={open}
      onCancel={() => setOpen(false)}
      onGoFill={() => {
        setOpen(false);
        router.push(`/projects/${projectId}?tab=overview`);
      }}
    />
  );

  return { runWithPlannedWindow, openGate, dialog };
}
