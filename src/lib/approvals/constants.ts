/** 审批类型（后续可扩展合同、成本等） */
export const APPROVAL_TYPE = {
  CUSTOMER_CLAIM: "CUSTOMER_CLAIM",
} as const;

export type ApprovalType = (typeof APPROVAL_TYPE)[keyof typeof APPROVAL_TYPE];

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  CUSTOMER_CLAIM: "客户认领",
};
