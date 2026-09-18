"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { isHubTabActive, type HubTab } from "@/lib/nav/primary-nav";

type Props = {
  tabs: HubTab[];
};

export function HubTabs({ tabs }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  if (tabs.length <= 1) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b">
      {tabs.map((tab) => {
        const active = isHubTabActive(tab.href, pathname, search);
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
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
