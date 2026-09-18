"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  type PlansTasksCapabilities,
  type PlansTasksTab,
  visiblePlansTasksTabs,
} from "@/lib/plans-tasks/tabs";

export function PlansTasksTabs({
  active,
  capabilities,
}: {
  active: PlansTasksTab;
  capabilities: PlansTasksCapabilities;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabs = visiblePlansTasksTabs(capabilities);

  function setTab(tab: PlansTasksTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/plans-tasks?${params.toString()}`);
  }

  if (tabs.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2 border-b pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setTab(tab.id)}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            active === tab.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
