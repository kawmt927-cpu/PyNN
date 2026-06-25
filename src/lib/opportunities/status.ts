import type { OpportunityAbandonReason, OpportunityStatus } from "@prisma/client";

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  NOT_SIGNED: "未签约",
  SIGNED: "已签约",
  ABANDONED: "已放弃",
};

export const OPPORTUNITY_ABANDON_REASON_LABELS: Record<OpportunityAbandonReason, string> = {
  PRICE: "价格原因",
  BUSINESS_RELATIONSHIP: "商务关系",
  OPERATION_ERROR: "操作失误",
  OTHER: "其他",
};

/** 已结束商机：不再出现在待跟进列表 */
export const CLOSED_OPPORTUNITY_STATUSES: OpportunityStatus[] = ["SIGNED", "ABANDONED"];

export function isClosedOpportunityStatus(status: OpportunityStatus) {
  return CLOSED_OPPORTUNITY_STATUSES.includes(status);
}

/** Prisma 过滤：仅未签约商机可产生待跟进 */
export const pendingFollowUpOpportunityWhere = {
  status: { notIn: CLOSED_OPPORTUNITY_STATUSES },
} as const;

export function canSignOpportunity(status: OpportunityStatus) {
  return status === "NOT_SIGNED" || status === "SIGNED";
}

export function canAbandonOpportunity(status: OpportunityStatus) {
  return status === "NOT_SIGNED";
}

export function canAddOpportunityQuote(status: OpportunityStatus) {
  return status === "NOT_SIGNED";
}

export function formatAbandonSummary(
  reason: OpportunityAbandonReason,
  note?: string | null
) {
  const reasonLabel = OPPORTUNITY_ABANDON_REASON_LABELS[reason];
  return note?.trim()
    ? `放弃原因：${reasonLabel}；说明：${note.trim()}`
    : `放弃原因：${reasonLabel}`;
}
