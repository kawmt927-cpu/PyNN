"use client";

import { Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduleFullscreen } from "@/components/layout/dashboard-shell";
import { cn } from "@/lib/utils";

type Props = {
  projectName: string;
  customerName: string | null;
  children: React.ReactNode;
};

/**
 * 项目计划内容区：默认嵌在项目详情页头/标签下方；
 * 全屏时盖住侧栏与整页标题。全屏入口在标签行右侧。
 */
export function ProjectPlanChrome({
  projectName,
  customerName,
  children,
}: Props) {
  const { fullscreen, toggle } = useScheduleFullscreen();

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        fullscreen
          ? "fixed inset-0 z-50 overflow-hidden overscroll-none"
          : "min-h-[calc(100dvh-14rem)]"
      )}
    >
      {fullscreen ? (
        <div className="flex shrink-0 items-center justify-end gap-3 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              项目计划 · {projectName}
            </h1>
            {customerName && customerName !== projectName ? (
              <p className="truncate text-xs text-muted-foreground">{customerName}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5"
            onClick={toggle}
            title="退出全屏（Esc）"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            退出全屏
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          // 非全屏：不建中间滚动层，交给页面 main，避免嵌套滚轮锁死
          fullscreen ? "min-h-0 flex-1 overflow-y-auto p-3" : "pt-3"
        )}
      >
        {children}
      </div>
    </div>
  );
}
