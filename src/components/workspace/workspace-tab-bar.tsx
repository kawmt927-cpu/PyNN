"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceTabs } from "@/components/workspace/workspace-tabs-context";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";

export function WorkspaceTabBar() {
  const { tabs, activeKey, focusTab, closeTab, isTabDirty } = useWorkspaceTabs();
  const [pendingCloseKey, setPendingCloseKey] = useState<string | null>(null);

  if (tabs.length === 0) return null;

  const pendingTab = pendingCloseKey
    ? tabs.find((t) => t.key === pendingCloseKey)
    : null;

  function requestClose(key: string) {
    if (isTabDirty(key)) {
      setPendingCloseKey(key);
      return;
    }
    closeTab(key);
  }

  return (
    <>
      <div className="flex shrink-0 items-end gap-1.5 overflow-x-auto border-b bg-muted/50 px-2 pt-2">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const dirty = isTabDirty(tab.key);
          return (
            <div
              key={tab.key}
              role="tab"
              aria-selected={active}
              className={cn(
                "group flex max-w-[14rem] items-center gap-1 rounded-t-md border px-2.5 py-1.5 text-sm shadow-sm transition-colors",
                active
                  ? "-mb-px border-border border-b-background bg-background font-medium text-foreground"
                  : "mb-0.5 border-border/80 bg-muted text-muted-foreground hover:border-border hover:bg-background/80 hover:text-foreground"
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => focusTab(tab.key)}
                title={tab.title}
              >
                {dirty ? (
                  <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />
                ) : null}
                {tab.title}
              </button>
              <button
                type="button"
                aria-label={`关闭 ${tab.title}`}
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-sm",
                  "text-muted-foreground hover:bg-muted hover:text-foreground",
                  active ? "opacity-70 hover:opacity-100" : "opacity-50 group-hover:opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  requestClose(tab.key);
                }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmDestructiveDialog
        open={pendingCloseKey != null}
        title="关闭标签"
        message={
          pendingTab
            ? `「${pendingTab.title}」可能有未保存的更改，确定关闭？关闭后未保存内容将丢失。`
            : "有未保存的更改，确定关闭？"
        }
        confirmLabel="仍要关闭"
        onCancel={() => setPendingCloseKey(null)}
        onConfirm={() => {
          if (pendingCloseKey) closeTab(pendingCloseKey);
          setPendingCloseKey(null);
        }}
      />
    </>
  );
}
