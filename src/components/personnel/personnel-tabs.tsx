"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type PersonnelTabId = "info" | "costs";

type Props = {
  activeTab: PersonnelTabId;
  costsHref?: string;
  showInfoTab?: boolean;
  showCostsTab?: boolean;
};

export function PersonnelTabs({
  activeTab,
  costsHref,
  showInfoTab = true,
  showCostsTab = true,
}: Props) {
  const tabs: Array<{ id: PersonnelTabId; label: string; href: string }> = [];
  if (showInfoTab) {
    tabs.push({ id: "info", label: "人员信息", href: "/personnel?tab=info" });
  }
  if (showCostsTab) {
    tabs.push({
      id: "costs",
      label: "人员成本",
      href: costsHref ?? "/personnel?tab=costs",
    });
  }

  if (tabs.length <= 1) return null;

  return (
    <div className="flex gap-2 border-b overflow-x-auto">
      {tabs.map((tab) => {
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
