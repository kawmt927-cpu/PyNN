"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Home,
  MapPinned,
  MoreHorizontal,
  NotebookPen,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  match: (p: string) => boolean;
  /** 右上角红点（如待审批） */
  badge?: boolean;
};

const SALES_ITEMS: NavItem[] = [
  { href: "/mobile", label: "今日", icon: Home, match: (p) => p === "/mobile" },
  {
    href: "/mobile/check-in",
    label: "打卡",
    icon: MapPinned,
    match: (p) => p.startsWith("/mobile/check-in"),
  },
  {
    href: "/mobile/log",
    label: "日报",
    icon: NotebookPen,
    match: (p) => p.startsWith("/mobile/log"),
  },
  {
    href: "/mobile/metrics",
    label: "指标",
    icon: BarChart3,
    match: (p) => p.startsWith("/mobile/metrics"),
  },
  {
    href: "/mobile/more",
    label: "更多",
    icon: MoreHorizontal,
    match: (p) =>
      p.startsWith("/mobile/more") ||
      p.startsWith("/mobile/customers") ||
      p.startsWith("/mobile/opportunities") ||
      p.startsWith("/mobile/contracts") ||
      p.startsWith("/mobile/follow-ups") ||
      p.startsWith("/mobile/tasks"),
  },
];

const MANAGER_ITEMS: NavItem[] = [
  { href: "/mobile", label: "今日", icon: Home, match: (p) => p === "/mobile" },
  {
    href: "/mobile/check-in",
    label: "往来",
    icon: MapPinned,
    match: (p) => p.startsWith("/mobile/check-in"),
  },
  {
    href: "/mobile/reports",
    label: "日报",
    icon: NotebookPen,
    match: (p) => p.startsWith("/mobile/reports"),
  },
  {
    href: "/mobile/metrics",
    label: "指标",
    icon: BarChart3,
    match: (p) => p.startsWith("/mobile/metrics"),
  },
  {
    href: "/mobile/more",
    label: "更多",
    icon: MoreHorizontal,
    match: (p) =>
      p.startsWith("/mobile/more") ||
      p.startsWith("/mobile/customers") ||
      p.startsWith("/mobile/opportunities") ||
      p.startsWith("/mobile/contracts") ||
      p.startsWith("/mobile/follow-ups") ||
      p.startsWith("/mobile/plans") ||
      p.startsWith("/mobile/tasks") ||
      p.startsWith("/mobile/approvals"),
  },
];

type Props = {
  variant: "sales" | "manager";
  /** 更多入口是否显示红点（如有待审批） */
  moreBadge?: boolean;
};

export function MobileBottomNav({ variant, moreBadge = false }: Props) {
  const pathname = usePathname();
  const items = (variant === "manager" ? MANAGER_ITEMS : SALES_ITEMS).map((item) =>
    item.href === "/mobile/more" ? { ...item, badge: moreBadge } : item
  );

  return (
    <nav
      className="shrink-0 border-t bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
      aria-label="移动导航"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1 py-1.5 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                  {item.badge ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive"
                      aria-label="有待处理"
                    />
                  ) : null}
                </span>
                <span className={cn(active && "font-medium")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
