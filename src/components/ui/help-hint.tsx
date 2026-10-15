"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleHelp } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  /** 说明正文；支持多段 */
  content: ReactNode;
  className?: string;
  /** 无障碍名称 */
  label?: string;
  /** 弹层最大宽度 */
  contentClassName?: string;
};

/**
 * 标题旁小问号：悬停或点击展开说明。
 */
export function HelpHint({
  content,
  className,
  label = "查看说明",
  contentClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sky-600 transition-colors hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-400 dark:hover:bg-sky-950/40",
            className
          )}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onClick={(e) => {
            e.preventDefault();
            clearCloseTimer();
            setOpen((v) => !v);
          }}
        >
          <CircleHelp className="h-4 w-4" strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className={cn("max-w-sm p-3 text-sm leading-relaxed", contentClassName)}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2 text-muted-foreground">{content}</div>
      </PopoverContent>
    </Popover>
  );
}
