"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SchedulePlanBackLink } from "@/components/projects/schedule-plan-back-link";
import { useScheduleFullscreen } from "@/components/layout/dashboard-shell";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  planProjectId: string | null;
  returnTaskId: string | null;
  children: React.ReactNode;
};

/** 资源排班页外壳：默认贴合侧栏主区；可一键全屏 */
export function SchedulePageShell({ planProjectId, returnTaskId, children }: Props) {
  const { fullscreen, toggle } = useScheduleFullscreen();

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden overscroll-none bg-background",
        fullscreen ? "fixed inset-0 z-50" : "h-full min-h-0"
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
        <div className="flex items-center gap-4">
          {planProjectId ? (
            <SchedulePlanBackLink projectId={planProjectId} returnTaskFromUrl={returnTaskId} />
          ) : (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/projects">返回项目列表</Link>
            </Button>
          )}
          <h1 className="text-base font-semibold">资源排班</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {planProjectId ? (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/projects">返回项目列表</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={toggle}
            title={fullscreen ? "退出全屏（Esc）" : "全屏显示"}
          >
            {fullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                退出全屏
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                全屏
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
