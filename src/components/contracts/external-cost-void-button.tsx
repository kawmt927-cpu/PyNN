"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";
import type { ActionResult } from "@/lib/action-result";

type Props = {
  productId: string;
  productName: string;
  voided: boolean;
  hasPayouts: boolean;
  onVoid: (productId: string) => Promise<ActionResult>;
  onRestore: (productId: string) => Promise<ActionResult>;
};

export function ExternalCostVoidButton({
  productId,
  productName,
  voided,
  hasPayouts,
  onVoid,
  onRestore,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (voided) {
      if (!confirmDestructiveAction(`确定恢复已作废的「${productName}」？`)) return;
      startTransition(async () => {
        setError(null);
        const result = await onRestore(productId);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      });
      return;
    }

    const message = hasPayouts
      ? `「${productName}」已有实付记录，作废后将保留实付历史且不能再登记实付。确定作废？`
      : `「${productName}」尚无实付，将直接删除。确定继续？`;
    if (!confirmDestructiveAction(message)) return;

    startTransition(async () => {
      setError(null);
      const result = await onVoid(productId);
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
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? "处理中…" : voided ? "恢复" : hasPayouts ? "作废" : "删除"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
