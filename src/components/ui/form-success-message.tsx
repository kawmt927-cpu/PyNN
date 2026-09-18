"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** 表单保存成功提示（绿色文案，可自动消失） */
export function FormSuccessMessage({
  message,
  onClear,
  className,
  durationMs = 3500,
}: {
  message: string | null | undefined;
  onClear?: () => void;
  className?: string;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!message || !onClear) return;
    const timer = window.setTimeout(onClear, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, onClear, durationMs]);

  if (!message) return null;
  return (
    <p
      role="status"
      className={cn("text-sm text-green-600 dark:text-green-400", className)}
    >
      {message}
    </p>
  );
}
