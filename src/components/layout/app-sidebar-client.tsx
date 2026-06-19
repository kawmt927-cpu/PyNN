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
};

export function AppSidebarClient({ nav, userName, roleLabel }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card">
      <div className="border-b p-4">
        <h1 className="text-lg font-bold text-primary">培安 CRM</h1>
        <p className="text-xs text-muted-foreground">医院软件 CRM + 项目管理</p>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors",
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted"
            )}
          >
            {item.label}
          </Link>
        ))}
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
