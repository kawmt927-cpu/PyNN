import type { InstallmentCollectionStatus } from "@prisma/client";

/** 界面展示用（含由回款推导的已完成） */
export type EffectiveCollectionStatus =
  | InstallmentCollectionStatus
  | "COMPLETED";

export const MANUAL_COLLECTION_STATUSES = [
  "NOT_STARTED",
  "READY",
  "IN_COLLECTION",
  "DIFFICULT",
  "BAD_DEBT",
] as const satisfies ReadonlyArray<InstallmentCollectionStatus>;

export type ManualCollectionStatus = (typeof MANUAL_COLLECTION_STATUSES)[number];

export const COLLECTION_STATUS_LABELS: Record<EffectiveCollectionStatus, string> = {
  NOT_STARTED: "未开始",
  READY: "可催款",
  IN_COLLECTION: "回款中",
  DIFFICULT: "回款困难",
  BAD_DEBT: "坏账",
  COMPLETED: "已完成",
};

export function isManualCollectionStatus(
  value: string
): value is ManualCollectionStatus {
  return (MANUAL_COLLECTION_STATUSES as readonly string[]).includes(value);
}

/** 回款满额 → 已完成；否则用库内催收状态 */
export function resolveEffectiveCollectionStatus(input: {
  percentComplete: number;
  collectionStatus: InstallmentCollectionStatus | string;
}): EffectiveCollectionStatus {
  if (input.percentComplete >= 100 - 1e-9) return "COMPLETED";
  const status = input.collectionStatus;
  if (
    status === "NOT_STARTED" ||
    status === "READY" ||
    status === "IN_COLLECTION" ||
    status === "DIFFICULT" ||
    status === "BAD_DEBT"
  ) {
    return status;
  }
  return "NOT_STARTED";
}

/**
 * 运营待回款分段：
 * - 困难 → difficult
 * - 可催款 / 回款中 → ready
 * - 未开始 → pending（再由期数拆 实施中 / 待实施）
 * - 已完成 / 坏账 → 不计入
 */
export function collectionStatusToArSegment(
  status: EffectiveCollectionStatus
): "ready" | "difficult" | "pending" | null {
  if (status === "COMPLETED" || status === "BAD_DEBT") return null;
  if (status === "DIFFICULT") return "difficult";
  if (status === "READY" || status === "IN_COLLECTION") return "ready";
  return "pending";
}

/** 阶段刚完成：仅把仍为「未开始」的绑定分期提升为「可催款」 */
export function shouldPromoteToReadyOnPhaseComplete(
  status: InstallmentCollectionStatus | string
): boolean {
  return status === "NOT_STARTED";
}

/** 出现部分回款且仍为未开始 → 回款中 */
export function shouldAutoInCollection(input: {
  percentComplete: number;
  collectionStatus: InstallmentCollectionStatus | string;
}): boolean {
  return (
    input.percentComplete > 0 &&
    input.percentComplete < 100 - 1e-9 &&
    input.collectionStatus === "NOT_STARTED"
  );
}

/** 手动改状态校验；返回错误文案，通过则 null */
export function validateManualCollectionStatusChange(input: {
  percentComplete: number;
  next: ManualCollectionStatus;
}): string | null {
  if (input.percentComplete >= 100 - 1e-9) {
    return "已完成不可更改状态（需清空回款后才会退出已完成）";
  }
  if (input.next === "NOT_STARTED" && input.percentComplete > 0) {
    return "已有回款时不能设为「未开始」，请先清空相关回款";
  }
  return null;
}

/** 当前可选手动状态（用于下拉） */
export function allowedManualCollectionStatuses(
  percentComplete: number
): ManualCollectionStatus[] {
  if (percentComplete >= 100 - 1e-9) return [];
  if (percentComplete > 0) {
    return MANUAL_COLLECTION_STATUSES.filter((s) => s !== "NOT_STARTED");
  }
  return [...MANUAL_COLLECTION_STATUSES];
}
