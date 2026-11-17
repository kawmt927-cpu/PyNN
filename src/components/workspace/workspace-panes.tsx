"use client";

import { useEffect, useRef, useState } from "react";
import {
  iframeSrcForTab,
  useWorkspaceTabs,
  type WorkspaceTab,
} from "@/components/workspace/workspace-tabs-context";
import { stripEmbedParam } from "@/lib/workspace/tab-keys";
import { cn } from "@/lib/utils";

function readIframeBusinessHref(iframe: HTMLIFrameElement): string | null {
  try {
    const loc = iframe.contentWindow?.location;
    if (!loc || loc.origin === "null") return null;
    return stripEmbedParam(`${loc.pathname}${loc.search}${loc.hash}`);
  } catch {
    return null;
  }
}

function pathOnly(href: string): string {
  return href.split("?")[0] || href;
}

function WorkspaceTabIframe({
  tab,
  active,
}: {
  tab: WorkspaceTab;
  active: boolean;
}) {
  const { registerTabIframe } = useWorkspaceTabs();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** 仅首次挂载用；query 变化由页内自行导航，避免父壳改 src 打断筛选 */
  const initialSrcRef = useRef(iframeSrcForTab(tab.href));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    registerTabIframe(tab.key, iframeRef.current);
    return () => registerTabIframe(tab.key, null);
  }, [tab.key, registerTabIframe]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const targetHref = stripEmbedParam(tab.href);
    const targetPath = pathOnly(targetHref);
    const current = readIframeBusinessHref(iframe);

    if (current === targetHref) return;
    // 同 pathname 仅 query 不同：列表筛选等由 iframe 自己跳，父壳只同步状态
    if (current != null && pathOnly(current) === targetPath) return;

    const target = iframeSrcForTab(tab.href);
    if (iframe.getAttribute("src") === target) return;
    setLoading(true);
    iframe.src = target;
  }, [tab.href]);

  return (
    <div
      className={cn(
        "absolute inset-0 size-full",
        active ? "z-10" : "pointer-events-none z-0 opacity-0"
      )}
    >
      {active && loading ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 text-sm text-muted-foreground"
          aria-busy="true"
          aria-live="polite"
        >
          加载中…
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title={tab.title}
        src={initialSrcRef.current}
        onLoad={() => setLoading(false)}
        className="absolute inset-0 size-full border-0 bg-background"
      />
    </div>
  );
}

export function WorkspacePanes() {
  const { tabs, activeKey } = useWorkspaceTabs();

  if (tabs.length === 0) return null;

  return (
    <div className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
      {tabs.map((tab) => (
        <WorkspaceTabIframe
          key={tab.key}
          tab={tab}
          active={tab.key === activeKey}
        />
      ))}
    </div>
  );
}
