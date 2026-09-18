/** 审批类型（后续可扩展） */
export const APPROVAL_TYPE = {
  CUSTOMER_CLAIM: "CUSTOMER_CLAIM",
  CONTRACT: "CONTRACT",
  EXPENSE: "EXPENSE",
  FOLLOW_UP_CONFIRM: "FOLLOW_UP_CONFIRM",
  CONTACT_CONFIRM: "CONTACT_CONFIRM",
  OPPORTUNITY_CONFIRM: "OPPORTUNITY_CONFIRM",
} as const;

export type ApprovalType = (typeof APPROVAL_TYPE)[keyof typeof APPROVAL_TYPE];

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  CUSTOMER_CLAIM: "客户认领",
  CONTRACT: "合同审核",
  EXPENSE: "报销",
  /** 非本人客户往来 + 同次提交的联系人/商机，一次确认 */
  FOLLOW_UP_CONFIRM: "非本人客户确认",
  CONTACT_CONFIRM: "联系人确认",
  OPPORTUNITY_CONFIRM: "商机确认",
};

/** 联系人/商机确认已并入「非本人客户确认」，旧链接仍可解析 */
export function normalizeApprovalType(raw: string | undefined): ApprovalType | null {
  if (!raw) return null;
  if (raw === APPROVAL_TYPE.CONTACT_CONFIRM || raw === APPROVAL_TYPE.OPPORTUNITY_CONFIRM) {
    return APPROVAL_TYPE.FOLLOW_UP_CONFIRM;
  }
  if ((Object.values(APPROVAL_TYPE) as string[]).includes(raw)) {
    return raw as ApprovalType;
  }
  return null;
}

/** 审批页卡片顺序（用于无 type 时自动跳到首个有待办的类型） */
export function approvalTypeTabOrder(input: {
  canSalesApprovals: boolean;
  expenseOn: boolean;
}): ApprovalType[] {
  const tabs: ApprovalType[] = [];
  if (input.canSalesApprovals) {
    tabs.push(
      APPROVAL_TYPE.CUSTOMER_CLAIM,
      APPROVAL_TYPE.CONTRACT,
      APPROVAL_TYPE.FOLLOW_UP_CONFIRM
    );
  }
  if (input.expenseOn) {
    tabs.push(APPROVAL_TYPE.EXPENSE);
  }
  return tabs;
}

export function pickDefaultApprovalType(input: {
  canSalesApprovals: boolean;
  expenseOn: boolean;
  pendingCounts: Partial<Record<ApprovalType, number>>;
}): ApprovalType {
  const order = approvalTypeTabOrder(input);
  const withPending = order.find((type) => (input.pendingCounts[type] ?? 0) > 0);
  return withPending ?? order[0] ?? APPROVAL_TYPE.CUSTOMER_CLAIM;
}
