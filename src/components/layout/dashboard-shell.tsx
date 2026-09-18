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

type Props = {
  nav: NavItem[];
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
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [fullscreen, setFullscreen] = useState(false);

  const exit = useCallback(() => setFullscreen(false), []);
  const enter = useCallback(() => setFullscreen(true), []);
  const toggle = useCallback(() => setFullscreen((v) => !v), []);

  // 切换路由/标签时退出全屏，避免状态残留盖住错误内容
  useEffect(() => {
    setFullscreen(false);
  }, [routeKey]);

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

function DashboardShellInner({
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
        <main
          className={cn(
            "min-h-0 flex-1 overscroll-contain",
            embedSchedule
              ? "overflow-hidden p-0"
              : "overflow-y-auto p-6 [scrollbar-gutter:stable]"
          )}
        >
          {children}
        </main>
      </div>
    </ScheduleFullscreenProvider>
  );
}

function DashboardShellFallback({
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
  return (
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
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 [scrollbar-gutter:stable]">
        {children}
      </main>
    </div>
  );
}

export function DashboardShell(props: Props) {
  return (
    <Suspense fallback={<DashboardShellFallback {...props} />}>
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
