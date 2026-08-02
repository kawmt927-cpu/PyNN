"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  confirmWeeklyAssignment,
  markWeeklyAssignmentDone,
  rejectWeeklyAssignment,
} from "@/app/(dashboard)/plans-tasks/actions";

type Props = {
  assignmentId: string;
  mode: "mark_done" | "confirm" | "reject";
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

export function GeneralAssignmentActionButton({
  assignmentId,
  mode,
  label,
  variant = "default",
  size = "sm",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultLabel =
    mode === "mark_done" ? "标记完成" : mode === "confirm" ? "确认完成" : "驳回";

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "mark_done"
          ? await markWeeklyAssignmentDone(assignmentId)
          : mode === "confirm"
            ? await confirmWeeklyAssignment(assignmentId)
            : await rejectWeeklyAssignment(assignmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        variant={mode === "reject" ? "outline" : variant}
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? "处理中…" : label ?? defaultLabel}
      </Button>
      {error ? <p className="max-w-[10rem] text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
