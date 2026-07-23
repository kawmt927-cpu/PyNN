"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/lib/permissions";
import type { ImpersonationTarget } from "@/lib/auth/impersonation";
import { AdminImpersonationPanel } from "@/components/admin/admin-impersonation-panel";
import { ClientModeSwitch } from "@/components/layout/client-mode-switch";

type Props = {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  pendingApprovalCount?: number;
  unreadNotificationCount?: number;
  impersonationTargets?: ImpersonationTarget[];
  impersonatorName?: string | null;
  showMobileSwitch?: boolean;
};

/** 取最长前缀匹配，避免 /contracts 与 /contracts/external-costs 同时高亮 */
function resolveActiveNavHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter(
    (href) =>
      pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, href) => (href.length > best.length ? href : best));
}

export function AppSidebarClient({
  nav,
  userName,
  roleLabel,
  pendingApprovalCount = 0,
  unreadNotificationCount = 0,
  impersonationTargets = [],
  impersonatorName = null,
  showMobileSwitch = false,
}: Props) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const showImpersonation =
    Boolean(impersonatorName) || impersonationTargets.length > 0;
  const activeHref = resolveActiveNavHref(
    pathname,
    nav.map((item) => item.href)
  );

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-4">
        <h1 className="text-lg font-bold text-primary">培安 CRM</h1>
        <p className="text-xs text-muted-foreground">医院软件 CRM + 项目管理</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const isActive = item.href === activeHref;
          const showApprovalDot = item.href === "/approvals" && pendingApprovalCount > 0;
          const showNotificationDot =
            item.href === "/notifications" && unreadNotificationCount > 0;
          const showDot = showApprovalDot || showNotificationDot;
          const isNavigating = pendingHref === item.href && !isActive;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-busy={isNavigating || undefined}
              onClick={() => {
                if (isActive) return;
                // 同步高亮「加载中」，避免企微 WebView 里点击后长时间无反馈
                setPendingHref(item.href);
              }}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted",
                pendingHref === item.href && !isActive && "bg-muted/80 text-primary"
              )}
            >
              <span className="flex items-center gap-2">
                {item.label}
                {pendingHref === item.href && !isActive ? (
                  <span className="text-xs opacity-80">加载中…</span>
                ) : null}
              </span>
              {showDot && (
                <>
                  <span className="sr-only">
                    {showApprovalDot
                      ? `${pendingApprovalCount} 条待审批`
                      : `${unreadNotificationCount} 条未读通知`}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full bg-red-500",
                      isActive ? "ring-2 ring-primary-foreground/30" : "ring-2 ring-card"
                    )}
                  />
                </>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <p className="text-sm font-medium">{userName}</p>
        <p className="text-xs text-muted-foreground">{roleLabel}</p>
        {showImpersonation ? (
          <AdminImpersonationPanel
            targets={impersonationTargets}
            impersonatorName={impersonatorName}
          />
        ) : null}
        {showMobileSwitch ? (
          <ClientModeSwitch target="mobile" className="mt-2" variant="outline" size="sm" />
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          退出登录
        </Button>
      </div>
    </aside>
  );
}
