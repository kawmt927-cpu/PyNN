"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppSidebarClient } from "@/components/layout/app-sidebar-client";
import type { NavItem } from "@/lib/permissions";
import type { ImpersonationTarget } from "@/lib/auth/impersonation";
import { cn } from "@/lib/utils";
import {
  useWorkspaceTabs,
  WorkspaceTabsProvider,
} from "@/components/workspace/workspace-tabs-context";
import { WorkspaceTabBar } from "@/components/workspace/workspace-tab-bar";
import { WorkspacePanes } from "@/components/workspace/workspace-panes";
import { EmbedDirtyTracker } from "@/components/workspace/embed-dirty-tracker";

type Props = {
  nav: NavItem[];
  userId: string;
  userName: string;
  roleLabel: string;
  pendingApprovalCount?: number;
  unreadNotificationCount?: number;
  impersonationTargets?: ImpersonationTarget[];
  impersonatorName?: string | null;
  showMobileSwitch?: boolean;
  children: React.ReactNode;
};

type ScheduleFullscreenApi = {
  fullscreen: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
};

const ScheduleFullscreenContext = createContext<ScheduleFullscreenApi | null>(
  null
);

/** 资源排班模块：占满主区高度，默认仍显示侧栏（全屏由页面内按钮控制） */
function isEmbedScheduleLayout(pathname: string) {
  return (
    pathname === "/projects/schedule" || pathname.startsWith("/projects/schedule/")
  );
}

/** 排班/计划全屏：标签行与内容区共享同一状态 */
function ScheduleFullscreenProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [fullscreen, setFullscreen] = useState(false);

  const exit = useCallback(() => setFullscreen(false), []);
  const enter = useCallback(() => setFullscreen(true), []);
  const toggle = useCallback(() => setFullscreen((v) => !v), []);

  useEffect(() => {
    setFullscreen(false);
  }, [pathname]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen, exit]);

  const value = useMemo(
    () => ({ fullscreen, enter, exit, toggle }),
    [fullscreen, enter, exit, toggle]
  );

  return (
    <ScheduleFullscreenContext.Provider value={value}>
      {children}
    </ScheduleFullscreenContext.Provider>
  );
}

function useIsEmbedMode() {
  const searchParams = useSearchParams();
  if (searchParams.get("embed") === "1") return true;
  if (typeof window !== "undefined" && window.parent !== window) return true;
  return false;
}

function DashboardShellChrome({
  nav,
  userName,
  roleLabel,
  pendingApprovalCount,
  unreadNotificationCount,
  impersonationTargets,
  impersonatorName,
  showMobileSwitch,
  children,
}: Props) {
  const pathname = usePathname();
  const embedSchedule = isEmbedScheduleLayout(pathname);
  const { tabs } = useWorkspaceTabs();
  const hasWorkspaceTabs = tabs.length > 0;

  return (
    <ScheduleFullscreenProvider>
      <div className="flex h-dvh overflow-hidden overscroll-none">
        <AppSidebarClient
          nav={nav}
          userName={userName}
          roleLabel={roleLabel}
          pendingApprovalCount={pendingApprovalCount}
          unreadNotificationCount={unreadNotificationCount}
          impersonationTargets={impersonationTargets}
          impersonatorName={impersonatorName}
          showMobileSwitch={showMobileSwitch}
        />
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceTabBar />
          <main
            className={cn(
              "min-h-0 flex-1 overscroll-contain",
              hasWorkspaceTabs
                ? "relative flex flex-col overflow-hidden p-0"
                : embedSchedule
                  ? "overflow-hidden p-0"
                  : "overflow-y-auto p-6 [scrollbar-gutter:stable]"
            )}
          >
            {hasWorkspaceTabs ? (
              <WorkspacePanes />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </ScheduleFullscreenProvider>
  );
}

function EmbedShell({ children }: { children: React.ReactNode }) {
  // iframe 内：html/body 定高，正文区自己滚动，避免无法上下滚动
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.cssText;
    const prevBody = body.style.cssText;
    html.style.height = "100%";
    html.style.overflow = "hidden";
    body.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.margin = "0";
    return () => {
      html.style.cssText = prevHtml;
      body.style.cssText = prevBody;
    };
  }, []);

  return (
    <ScheduleFullscreenProvider>
      <EmbedDirtyTracker />
      <div
        data-workspace-embed-scroll
        className="box-border h-full overflow-y-auto overscroll-contain bg-background p-6 [scrollbar-gutter:stable]"
      >
        {children}
      </div>
    </ScheduleFullscreenProvider>
  );
}

function DashboardShellInner(props: Props) {
  const isEmbed = useIsEmbedMode();

  if (isEmbed) {
    return <EmbedShell>{props.children}</EmbedShell>;
  }

  return (
    <WorkspaceTabsProvider userId={props.userId}>
      <DashboardShellChrome {...props} />
    </WorkspaceTabsProvider>
  );
}

export function DashboardShell(props: Props) {
  return (
    <Suspense fallback={null}>
      <DashboardShellInner {...props} />
    </Suspense>
  );
}

/** 排班/计划全屏：与标签行按钮共享状态（须在 DashboardShell 内） */
export function useScheduleFullscreen(): ScheduleFullscreenApi {
  const ctx = useContext(ScheduleFullscreenContext);
  if (!ctx) {
    throw new Error("useScheduleFullscreen must be used within DashboardShell");
  }
  return ctx;
}
