"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  pending?: boolean;
  /** destructive 用于关闭等不可逆操作 */
  variant?: "default" | "destructive";
  onCancel: () => void;
  onConfirm: () => void;
};

/** 操作确认（不依赖 window.confirm，避免被弹层/WebView 拦截） */
export function ConfirmDestructiveDialog({
  open,
  title = "确认操作",
  message,
  confirmLabel = "确定",
  pending = false,
  variant = "destructive",
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent className="max-w-md" showCloseButton={!pending} closeOnOutsideClick={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            取消
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "处理中…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
