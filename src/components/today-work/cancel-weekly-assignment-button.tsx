"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelWeeklyAssignment } from "@/app/(dashboard)/plans-tasks/actions";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";

export function CancelWeeklyAssignmentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={() => {
          if (!confirmDestructiveAction("确定取消这条周任务吗？")) return;
          startTransition(async () => {
            setError(null);
            const result = await cancelWeeklyAssignment(id);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        取消
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
