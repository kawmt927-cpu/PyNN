"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  confirmWeeklyAssignment,
  rejectWeeklyAssignment,
} from "@/app/(dashboard)/plans-tasks/actions";
import { markNotificationAsRead } from "@/app/(dashboard)/notifications/actions";

type Props = {
  assignmentId: string;
  receiptId: string;
  unread: boolean;
};

export function NotificationAssignmentConfirmActions({
  assignmentId,
  receiptId,
  unread,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(mode: "confirm" | "reject") {
    startTransition(async () => {
      const result =
        mode === "confirm"
          ? await confirmWeeklyAssignment(assignmentId)
          : await rejectWeeklyAssignment(assignmentId);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      if (unread) {
        await markNotificationAsRead(receiptId);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => run("confirm")}>
        {pending ? "处理中…" : "确认完成"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run("reject")}
      >
        驳回
      </Button>
    </div>
  );
}
