"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { returnLabelForPath } from "@/lib/navigation/return-to";
import { Button } from "@/components/ui/button";
import {
  requestOpenWorkspaceTab,
  requestWorkspaceBackToList,
  useWorkspaceTabsOptional,
} from "@/components/workspace/workspace-tabs-context";
import {
  entityTabKey,
  parseEntityFromHref,
} from "@/lib/workspace/tab-keys";

type Props = {
  href: string;
  label?: string;
};

function listTitleFromLabel(label: string): string {
  const trimmed = label.replace(/^返回/, "").trim();
  return trimmed || "列表";
}

export function BackLink({ href, label }: Props) {
  const workspace = useWorkspaceTabsOptional();
  const displayLabel = label ?? returnLabelForPath(href);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === "undefined") return;
    const inEmbed = window.parent !== window;
    // 工作区壳或嵌入页：走标签切换，避免 App Router soft nav 卡住
    if (!workspace && !inEmbed) return;

    e.preventDefault();
    e.stopPropagation();

    const entity = parseEntityFromHref(href);
    if (entity) {
      const payload = {
        key: entityTabKey(entity.kind, entity.id),
        title: "",
        href,
      };
      if (workspace) workspace.openOrFocusTab(payload);
      else requestOpenWorkspaceTab(payload);
      return;
    }

    const title = listTitleFromLabel(displayLabel);
    if (workspace) workspace.backToList(href, title);
    else requestWorkspaceBackToList(href, title);
  }

  return (
    <Button asChild variant="outline">
      <Link href={href} onClick={handleClick} prefetch={false}>
        {displayLabel}
      </Link>
    </Button>
  );
}
