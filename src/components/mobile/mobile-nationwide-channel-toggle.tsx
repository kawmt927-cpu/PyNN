"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCustomerNationwideChannel } from "@/app/(dashboard)/customers/actions";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { cn } from "@/lib/utils";

type Props = {
  customerId: string;
  nationwideChannel: boolean;
  contactProvinceCount: number;
};

export function MobileNationwideChannelToggle({
  customerId,
  nationwideChannel,
  contactProvinceCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function apply(next: boolean, confirmClear = false) {
    setError(null);
    startTransition(async () => {
      const result = await setCustomerNationwideChannel(customerId, next, confirmClear);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function onToggle() {
    const next = !nationwideChannel;
    if (!next && contactProvinceCount > 0) {
      setConfirmOpen(true);
      return;
    }
    apply(next);
  }

  return (
    <div className="shrink-0 space-y-1 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={onToggle}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium",
          nationwideChannel
            ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
            : "bg-muted text-muted-foreground"
        )}
      >
        {pending ? "…" : nationwideChannel ? "是 · 点此取消" : "否 · 点此开启"}
      </button>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      <ConfirmDestructiveDialog
        open={confirmOpen}
        title="取消全国性渠道"
        message={`当前有 ${contactProvinceCount} 位联系人标注了负责省区。取消后这些负责省区将被清空。确定继续？`}
        confirmLabel="确定取消"
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => apply(false, true)}
      />
    </div>
  );
}
