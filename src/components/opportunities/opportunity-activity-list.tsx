"use client";

import { useState } from "react";
import { format } from "date-fns";
import { labelForConfig } from "@/lib/config-options";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import type { OpportunityActivityItem } from "@/lib/opportunities/activity";
import type { ConfigOptionItem } from "@/lib/config-options";
import {
  OpportunityFollowUpForm,
  type OpportunityFollowUpSnapshot,
} from "@/components/opportunities/opportunity-follow-up-form";
import { ChangeSummaryList } from "@/components/opportunities/change-summary-list";
import { Button } from "@/components/ui/button";

type Props = {
  items: OpportunityActivityItem[];
  stageLabels: Record<string, string>;
  canEditFollowUps?: boolean;
  opportunityId: string;
  opportunity: OpportunityFollowUpSnapshot;
  stageOptions: ConfigOptionItem[];
};

export function OpportunityActivityList({
  items,
  stageLabels,
  canEditFollowUps = false,
  opportunityId,
  opportunity,
  stageOptions,
}: Props) {
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无记录。</p>;
  }

  return (
    <ul className="space-y-4 text-sm">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="rounded-md border p-4">
          {item.kind === "stage" ? (
            <StageActivityItem item={item} stageLabels={stageLabels} />
          ) : editingFollowUpId === item.id ? (
            <OpportunityFollowUpForm
              mode="edit"
              opportunityId={opportunityId}
              opportunity={opportunity}
              stageOptions={stageOptions}
              initialFollowUp={{
                id: item.id,
                method: item.method,
                content: item.content,
                followUpAt: item.at,
                nextFollowUpAt: item.nextFollowUpAt,
              }}
              onCancel={() => setEditingFollowUpId(null)}
              compact
            />
          ) : (
            <FollowUpActivityItem
              item={item}
              canEdit={canEditFollowUps}
              onEdit={() => setEditingFollowUpId(item.id)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function StageActivityItem({
  item,
  stageLabels,
}: {
  item: Extract<OpportunityActivityItem, { kind: "stage" }>;
  stageLabels: Record<string, string>;
}) {
  const { title, body } = describeStageActivity(item, stageLabels);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        <span className="text-muted-foreground">{format(item.at, "yyyy-MM-dd HH:mm")}</span>
      </div>
      <p className="mt-1 text-muted-foreground">{item.user.name}</p>
      {body && <p className="mt-2 whitespace-pre-wrap">{body}</p>}
    </>
  );
}

function describeStageActivity(
  item: Extract<OpportunityActivityItem, { kind: "stage" }>,
  stageLabels: Record<string, string>
) {
  if (item.note === "创建商机") {
    return {
      title: "创建商机",
      body: `初始阶段：${labelForConfig(stageLabels, item.toStage)}`,
    };
  }

  if (item.note?.startsWith("编辑:")) {
    return {
      title: "编辑商机",
      body: item.note.slice("编辑:".length).trim(),
    };
  }

  if (item.note?.startsWith("状态变更:")) {
    return {
      title: "状态变更",
      body: item.note.slice("状态变更:".length).trim(),
    };
  }

  if (item.fromStage && item.fromStage !== item.toStage) {
    return {
      title: "阶段变更",
      body: `${labelForConfig(stageLabels, item.fromStage)} → ${labelForConfig(stageLabels, item.toStage)}${item.note ? `；${item.note}` : ""}`,
    };
  }

  return {
    title: "记录",
    body: item.note ?? labelForConfig(stageLabels, item.toStage),
  };
}

function FollowUpActivityItem({
  item,
  canEdit,
  onEdit,
}: {
  item: Extract<OpportunityActivityItem, { kind: "follow_up" }>;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">商机跟进 · {FOLLOW_UP_METHOD_LABELS[item.method]}</p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{format(item.at, "yyyy-MM-dd HH:mm")}</span>
          {canEdit && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}>
              编辑
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">{item.user.name}</p>
      <p className="mt-2 whitespace-pre-wrap">{item.content}</p>
      {item.changeSummary && <ChangeSummaryList summary={item.changeSummary} />}
      {item.nextFollowUpAt && (
        <p className="mt-1 text-orange-600">
          下次跟进：{format(item.nextFollowUpAt, "yyyy-MM-dd HH:mm")}
        </p>
      )}
    </>
  );
}
