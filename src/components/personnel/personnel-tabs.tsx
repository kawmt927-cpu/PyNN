"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type PersonnelTabId = "info" | "costs";

const TABS: Array<{ id: PersonnelTabId; label: string; href: string }> = [
  { id: "info", label: "人员信息", href: "/personnel?tab=info" },
  { id: "costs", label: "人员成本", href: "/personnel?tab=costs" },
];

type Props = {
  activeTab: PersonnelTabId;
  costsHref?: string;
};

export function PersonnelTabs({ activeTab, costsHref }: Props) {
  return (
    <div className="flex gap-2 border-b overflow-x-auto">
      {TABS.map((tab) => {
        const href = tab.id === "costs" && costsHref ? costsHref : tab.href;
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
