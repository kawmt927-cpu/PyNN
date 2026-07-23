"use client";

import { useState } from "react";
import {
  TeamWorkActivityFlatList,
  type TeamWorkActivityListItem,
} from "@/components/today-work/team-work-activity-list";

const PREVIEW_COUNT = 5;

type Props = {
  items: TeamWorkActivityListItem[];
  customerBasePath?: string;
  previewCount?: number;
};

export function MobileExpandableActivityFeed({
  items,
  customerBasePath = "/mobile/customers",
  previewCount = PREVIEW_COUNT,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const needsMore = items.length > previewCount;
  const visible = expanded || !needsMore ? items : items.slice(0, previewCount);

  return (
    <div className="space-y-3">
      <TeamWorkActivityFlatList items={visible} customerBasePath={customerBasePath} />
      {needsMore && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center rounded-xl border border-dashed bg-card px-4 py-3 text-sm font-medium text-primary active:bg-muted/60"
        >
          更多（还有 {items.length - previewCount} 条，展开后可滚动查看）
        </button>
      ) : null}
      {expanded && needsMore ? (
        <p className="text-center text-xs text-muted-foreground">已全部展开，可继续向上滑动浏览</p>
      ) : null}
    </div>
  );
}
