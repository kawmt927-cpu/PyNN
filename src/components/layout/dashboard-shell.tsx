"use client";

import { usePathname } from "next/navigation";
import { AppSidebarClient } from "@/components/layout/app-sidebar-client";
import type { NavItem } from "@/lib/permissions";

const FULLSCREEN_PREFIXES = ["/projects/schedule"];

type Props = {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  pendingApprovalCount?: number;
  children: React.ReactNode;
};

export function DashboardShell({
  nav,
  userName,
  roleLabel,
  pendingApprovalCount,
  children,
}: Props) {
  const pathname = usePathname();
  const fullscreen = FULLSCREEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (fullscreen) {
    return <main className="min-h-screen overflow-hidden bg-background">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebarClient
        nav={nav}
        userName={userName}
        roleLabel={roleLabel}
        pendingApprovalCount={pendingApprovalCount}
      />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
