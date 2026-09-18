"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  confirmTitle?: string;
  confirmMessage: string;
  confirmLabel?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "destructive" | "outline" | "ghost";
  className?: string;
  onDelete: () => Promise<ActionResult>;
};

/** 管理员/销管删除实体：确认弹窗 + Server Action */
export function EntityDeleteButton({
  label = "删除",
  confirmTitle = "确认删除",
  confirmMessage,
  confirmLabel = "确认删除",
  size = "default",
  variant = "destructive",
  className,
  onDelete,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await onDelete();
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (result.redirectTo) {
        router.push(result.redirectTo);
      }
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn(className)}
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {pending ? "删除中…" : label}
      </Button>
      <ConfirmDestructiveDialog
        open={open}
        title={confirmTitle}
        message={error ? `${confirmMessage}\n\n${error}` : confirmMessage}
        confirmLabel={confirmLabel}
        pending={pending}
        onCancel={() => {
          if (!pending) {
            setOpen(false);
            setError(null);
          }
        }}
        onConfirm={confirm}
      />
    </>
  );
}
