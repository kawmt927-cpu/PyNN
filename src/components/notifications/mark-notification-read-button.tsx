"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

export function MarkNotificationReadButton({
  receiptId,
  action,
}: {
  receiptId: string;
  action: (receiptId: string) => Promise<ActionResult>;
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
          await action(receiptId);
        });
      }}
    >
      {pending ? "标记中…" : "标为已读"}
    </Button>
  );
}
