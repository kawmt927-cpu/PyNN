"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

export function MarkAllNotificationsReadButton({
  action,
}: {
  action: () => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await action();
        });
      }}
    >
      {pending ? "处理中…" : "全部标为已读"}
    </Button>
  );
}
