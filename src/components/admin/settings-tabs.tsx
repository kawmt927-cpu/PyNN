"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "fields", label: "字段选项", href: "/admin/settings?tab=fields" },
  { id: "wecom", label: "企业微信", href: "/admin/settings?tab=wecom" },
] as const;

type Props = {
  activeTab: string;
};

export function SettingsTabs({ activeTab }: Props) {
  return (
    <div className="flex gap-2 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            activeTab === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
