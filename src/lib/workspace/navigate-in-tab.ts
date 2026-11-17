"use client";

import { requestWorkspaceSyncHref } from "@/components/workspace/workspace-tabs-context";
import { withEmbedParam } from "@/lib/workspace/tab-keys";

type ListRouter = {
  replace: (href: string, opts?: { scroll?: boolean }) => void;
  push: (href: string, opts?: { scroll?: boolean }) => void;
};

function inWorkspaceEmbed(): boolean {
  return typeof window !== "undefined" && window.parent !== window;
}

/**
 * 工作区标签内的列表筛选：
 * - 嵌入 iframe：硬导航（location.replace），避开 App Router soft-nav 线上僵死
 * - 非嵌入：router 软导航
 * 嵌入时保留 embed=1，并同步父壳标签 href。
 */
export function navigateListInWorkspaceTab(
  href: string,
  router: ListRouter,
  opts?: { replace?: boolean }
) {
  const replace = opts?.replace !== false;
  const inEmbed = inWorkspaceEmbed();
  if (inEmbed) {
    requestWorkspaceSyncHref(href);
    const target = withEmbedParam(href);
    if (replace) window.location.replace(target);
    else window.location.assign(target);
    return;
  }
  if (replace) router.replace(href, { scroll: false });
  else router.push(href, { scroll: false });
}
