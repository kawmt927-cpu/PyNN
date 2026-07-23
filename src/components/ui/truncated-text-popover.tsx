"use client";

import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  text: string | null | undefined;
  emptyLabel?: string;
  className?: string;
  contentClassName?: string;
};

/** 列表截断文案：悬停弹出全文（不用原生 title，兼容内置浏览器） */
export function TruncatedTextPopover({
  text,
  emptyLabel = "—",
  className,
  contentClassName,
}: Props) {
  const value = text?.trim() || "";
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openNow() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  if (!value) {
    return <span className={cn("text-muted-foreground", className)}>{emptyLabel}</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className={cn(
            "inline-block max-w-[16rem] cursor-default truncate text-left text-muted-foreground",
            className
          )}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onFocus={openNow}
          onBlur={scheduleClose}
          tabIndex={0}
        >
          {value}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "pointer-events-auto max-h-64 w-80 overflow-y-auto whitespace-pre-wrap p-3 text-sm",
          contentClassName
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
      >
        {value}
      </PopoverContent>
    </Popover>
  );
}
