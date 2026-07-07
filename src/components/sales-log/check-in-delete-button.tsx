"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";

type Props = {
  checkInId: string;
  hasFollowUp: boolean;
};

export function CheckInDeleteButton({ checkInId, hasFollowUp }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    const message = hasFollowUp
      ? "该打卡已完善为往来记录，删除打卡不会删除往来，确定删除吗？"
      : "确定删除这条打卡记录吗？";
    if (!confirmDestructiveAction(message)) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/sales-log/check-ins/${encodeURIComponent(checkInId)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          window.alert(data.error || "删除失败");
          return;
        }
        router.refresh();
      } catch {
        window.alert("删除失败，请稍后重试");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={handleDelete}
    >
      {pending ? "删除中…" : "删除"}
    </Button>
  );
}
