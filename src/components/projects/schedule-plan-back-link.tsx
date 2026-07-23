"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { peekScheduleReturn, saveScheduleReturn } from "@/lib/projects/task-form-draft";

type Props = {
  projectId: string;
  returnTaskFromUrl?: string | null;
};

/** 排班页「返回项目计划」：优先 URL 的 returnTask，否则读 sessionStorage（排班内操作可能冲掉 URL） */
export function SchedulePlanBackLink({ projectId, returnTaskFromUrl = null }: Props) {
  const [taskId, setTaskId] = useState(returnTaskFromUrl);

  useEffect(() => {
    if (returnTaskFromUrl) {
      saveScheduleReturn(projectId, returnTaskFromUrl);
      setTaskId(returnTaskFromUrl);
      return;
    }
    const stored = peekScheduleReturn(projectId);
    if (stored) setTaskId(stored);
  }, [projectId, returnTaskFromUrl]);

  const href = taskId
    ? `/projects/${projectId}?tab=plan&taskId=${encodeURIComponent(taskId)}`
    : `/projects/${projectId}?tab=plan`;

  return (
    <Button size="sm" className="h-8" asChild>
      <Link href={href}>返回项目计划</Link>
    </Button>
  );
}
