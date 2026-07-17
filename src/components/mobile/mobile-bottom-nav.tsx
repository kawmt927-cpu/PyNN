"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, MapPinned, MoreHorizontal, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/mobile", label: "今日", icon: Home, match: (p: string) => p === "/mobile" },
  {
    href: "/mobile/check-in",
    label: "打卡",
    icon: MapPinned,
    match: (p: string) => p.startsWith("/mobile/check-in"),
  },
  {
    href: "/mobile/log",
    label: "日报",
    icon: NotebookPen,
    match: (p: string) => p.startsWith("/mobile/log"),
  },
  {
    href: "/mobile/tasks",
    label: "待办",
    icon: ClipboardList,
    match: (p: string) => p.startsWith("/mobile/tasks"),
  },
  {
    href: "/mobile/more",
    label: "更多",
    icon: MoreHorizontal,
    match: (p: string) =>
      p.startsWith("/mobile/more") ||
      p.startsWith("/mobile/customers") ||
      p.startsWith("/mobile/opportunities") ||
      p.startsWith("/mobile/contracts"),
  },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="shrink-0 border-t bg-card pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
      aria-label="销售移动导航"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map((item) => {
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
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                <span className={cn(active && "font-medium")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
