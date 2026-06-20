import type { Opportunity } from "@prisma/client";
import { formatAmount } from "@/lib/opportunities/funnel";
import { labelForConfig } from "@/lib/config-options";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";

type EditInput = {
  title: string;
  ownerId: string;
  ownerName: string;
  expectedAmount: number;
  expectedCloseDate: string;
  stage: string;
  requirementDesc: string | null;
  winProbability: number | null;
  competitor: string | null;
  notes: string | null;
};

export type FollowUpOpportunityEditInput = {
  expectedAmount: number;
  expectedCloseDate: string;
  stage: string;
  requirementDesc: string | null;
  winProbability: number | null;
  competitor: string | null;
  notes: string | null;
};

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function pushChange(
  changes: string[],
  label: string,
  before: string | null,
  after: string | null
) {
  if (before === after) return;
  changes.push(`${label}：${before ?? "—"} → ${after ?? "—"}`);
}

export function buildFollowUpOpportunityChanges(
  existing: Pick<
    Opportunity,
    | "expectedAmount"
    | "expectedCloseDate"
    | "stage"
    | "requirementDesc"
    | "winProbability"
    | "competitor"
    | "notes"
    | "amountLocked"
  >,
  next: FollowUpOpportunityEditInput,
  stageLabels: Record<string, string>
): string[] {
  const changes: string[] = [];

  if (!existing.amountLocked && Number(existing.expectedAmount) !== next.expectedAmount) {
    pushChange(
      changes,
      "预计金额",
      formatAmount(existing.expectedAmount),
      formatAmount(next.expectedAmount)
    );
  }

  if (
    formatExpectedCloseMonth(existing.expectedCloseDate) !==
    formatExpectedCloseMonth(next.expectedCloseDate)
  ) {
    pushChange(
      changes,
      "预计签约",
      formatExpectedCloseMonth(existing.expectedCloseDate),
      formatExpectedCloseMonth(next.expectedCloseDate)
    );
  }

  if (existing.stage !== next.stage) {
    pushChange(
      changes,
      "阶段",
      labelForConfig(stageLabels, existing.stage),
      labelForConfig(stageLabels, next.stage)
    );
  }

  if (normalizeText(existing.requirementDesc) !== normalizeText(next.requirementDesc)) {
    pushChange(
      changes,
      "需求描述",
      normalizeText(existing.requirementDesc),
      normalizeText(next.requirementDesc)
    );
  }

  if ((existing.winProbability ?? null) !== next.winProbability) {
    pushChange(
      changes,
      "赢单概率",
      existing.winProbability != null ? `${existing.winProbability}%` : null,
      next.winProbability != null ? `${next.winProbability}%` : null
    );
  }

  if (normalizeText(existing.competitor) !== normalizeText(next.competitor)) {
    pushChange(
      changes,
      "竞争对手",
      normalizeText(existing.competitor),
      normalizeText(next.competitor)
    );
  }

  if (normalizeText(existing.notes) !== normalizeText(next.notes)) {
    pushChange(changes, "备注", normalizeText(existing.notes), normalizeText(next.notes));
  }

  return changes;
}

export function buildOpportunityEditChanges(
  existing: Opportunity & { owner: { name: string } },
  next: EditInput,
  stageLabels: Record<string, string>
): string[] {
  const changes: string[] = [];

  if (existing.title.trim() !== next.title.trim()) {
    pushChange(changes, "商机名称", existing.title.trim(), next.title.trim());
  }

  if (existing.ownerId !== next.ownerId) {
    pushChange(changes, "负责销售", existing.owner.name, next.ownerName);
  }

  changes.push(
    ...buildFollowUpOpportunityChanges(
      existing,
      {
        expectedAmount: next.expectedAmount,
        expectedCloseDate: next.expectedCloseDate,
        stage: next.stage,
        requirementDesc: next.requirementDesc,
        winProbability: next.winProbability,
        competitor: next.competitor,
        notes: next.notes,
      },
      stageLabels
    )
  );

  return changes;
}
