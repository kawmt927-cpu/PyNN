"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type ProjectTabItem = {
  id: string;
  label: string;
  href: string;
};

type Props = {
  activeTab: string;
  tabs: ProjectTabItem[];
};

export function ProjectTabs({ activeTab, tabs }: Props) {
  return (
    <div className="flex gap-2 border-b overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
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
