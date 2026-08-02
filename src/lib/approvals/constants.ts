/** 审批类型（后续可扩展） */
export const APPROVAL_TYPE = {
  CUSTOMER_CLAIM: "CUSTOMER_CLAIM",
  CONTRACT: "CONTRACT",
  EXPENSE: "EXPENSE",
} as const;

export type ApprovalType = (typeof APPROVAL_TYPE)[keyof typeof APPROVAL_TYPE];

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  CUSTOMER_CLAIM: "客户认领",
  CONTRACT: "合同审核",
  EXPENSE: "报销",
};
