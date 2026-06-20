"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type SettingsTabItem = {
  id: string;
  label: string;
  href: string;
};

type Props = {
  activeTab: string;
  tabs: SettingsTabItem[];
};

export function SettingsTabs({ activeTab, tabs }: Props) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex gap-2 border-b">
      {tabs.map((tab) => (
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
