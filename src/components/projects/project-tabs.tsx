"use client";

import Link from "next/link";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduleFullscreen } from "@/components/layout/dashboard-shell";
import { cn } from "@/lib/utils";

export type ProjectTabItem = {
  id: string;
  label: string;
  href: string;
};

type Props = {
  activeTab: string;
  tabs: ProjectTabItem[];
  /** 计划 / 资源排班页：标签行右侧显示全屏按钮 */
  showFullscreen?: boolean;
};

export function ProjectTabs({ activeTab, tabs, showFullscreen = false }: Props) {
  const { fullscreen, toggle } = useScheduleFullscreen();

  return (
    <div className="flex items-end justify-between gap-3 border-b">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {showFullscreen ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mb-1.5 h-8 shrink-0 gap-1.5"
          onClick={toggle}
          title={fullscreen ? "退出全屏（Esc）" : "全屏（隐藏侧栏与标题）"}
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
      ) : null}
    </div>
  );
}
