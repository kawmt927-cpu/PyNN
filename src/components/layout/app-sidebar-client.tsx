"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/lib/permissions";

type Props = {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  pendingApprovalCount?: number;
};

export function AppSidebarClient({
  nav,
  userName,
  roleLabel,
  pendingApprovalCount = 0,
}: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card">
      <div className="border-b p-4">
        <h1 className="text-lg font-bold text-primary">培安 CRM</h1>
        <p className="text-xs text-muted-foreground">医院软件 CRM + 项目管理</p>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const showApprovalDot = item.href === "/approvals" && pendingApprovalCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <span>{item.label}</span>
              {showApprovalDot && (
                <>
                  <span className="sr-only">{pendingApprovalCount} 条待审批</span>
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
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => signOut({ callbackUrl: "/login" })}>
          退出登录
        </Button>
      </div>
    </aside>
  );
}
