"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelWeeklyAssignment } from "@/app/(dashboard)/weekly-tasks/actions";

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
      onClick={() =>
        startTransition(async () => {
          await cancelWeeklyAssignment(id);
          router.refresh();
        })
      }
    >
      取消
    </Button>
  );
}
