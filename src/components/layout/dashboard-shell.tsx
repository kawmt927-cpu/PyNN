"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppSidebarClient } from "@/components/layout/app-sidebar-client";
import type { NavItem } from "@/lib/permissions";
import type { ImpersonationTarget } from "@/lib/auth/impersonation";

const FULLSCREEN_PREFIXES = ["/projects/schedule"];

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

function isProjectDetailPath(pathname: string) {
  return /^\/projects\/[^/]+$/.test(pathname);
}

function isProjectPlanTab(tab: string | null) {
  return tab === "plan" || tab === "phases";
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
  const searchParams = useSearchParams();
  const fullscreenByPath = FULLSCREEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const fullscreenByPlan =
    isProjectDetailPath(pathname) && isProjectPlanTab(searchParams.get("tab"));
  const fullscreen = fullscreenByPath || fullscreenByPlan;

  if (fullscreen) {
    return <main className="h-dvh overflow-hidden overscroll-none bg-background">{children}</main>;
  }

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

/** 项目计划页与资源排班一样隐藏左侧导航，给甘特留出横向空间 */
export function DashboardShell(props: Props) {
  return (
    <Suspense fallback={<DashboardShellFallback {...props} />}>
      <DashboardShellInner {...props} />
    </Suspense>
  );
}
