"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelWeeklyAssignment } from "@/app/(dashboard)/plans-tasks/actions";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";

export function CancelWeeklyAssignmentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!confirmDestructiveAction("确定取消这条周任务吗？")) return;
        startTransition(async () => {
          await cancelWeeklyAssignment(id);
          router.refresh();
        });
      }}
    >
      取消
    </Button>
  );
}
