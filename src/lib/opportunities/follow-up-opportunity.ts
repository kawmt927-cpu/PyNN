import type { Opportunity, Prisma } from "@prisma/client";
import { parseExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import {
  buildFollowUpOpportunityChanges,
  type FollowUpOpportunityEditInput,
} from "@/lib/opportunities/edit-log";

export function toFollowUpOpportunityInput(parsed: {
  expectedAmount: number;
  expectedCloseDate: string;
  stage: string;
  requirementDesc?: string;
  winProbability?: number | null;
  competitor?: string;
  notes?: string;
}): FollowUpOpportunityEditInput {
  return {
    expectedAmount: parsed.expectedAmount,
    expectedCloseDate: parsed.expectedCloseDate,
    stage: parsed.stage,
    requirementDesc: parsed.requirementDesc?.trim() || null,
    winProbability: parsed.winProbability ?? null,
    competitor: parsed.competitor?.trim() || null,
    notes: parsed.notes?.trim() || null,
  };
}

export function buildFollowUpOpportunityUpdateData(
  existing: Pick<Opportunity, "amountLocked">,
  input: FollowUpOpportunityEditInput
): Prisma.OpportunityUpdateInput {
  return {
    expectedAmount: existing.amountLocked ? undefined : input.expectedAmount,
    expectedCloseDate: parseExpectedCloseMonth(input.expectedCloseDate),
    stage: input.stage,
    requirementDesc: input.requirementDesc,
    winProbability: input.winProbability,
    competitor: input.competitor,
    notes: input.notes,
  };
}

export function summarizeFollowUpOpportunityChanges(
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
  input: FollowUpOpportunityEditInput,
  stageLabels: Record<string, string>
) {
  const changes = buildFollowUpOpportunityChanges(existing, input, stageLabels);
  return changes.length > 0 ? changes.join("; ") : null;
}
