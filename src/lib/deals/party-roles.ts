import type { DealPartyRole } from "@prisma/client";

export const DEAL_PARTY_ROLE_LABELS: Record<DealPartyRole, string> = {
  PRIMARY: "主要客户",
  CHANNEL: "渠道",
  THIRD_PARTY: "第三方",
  OTHER: "其他",
};

/** 商机/合同「额外关联」可选角色（主要客户用独立字段） */
export const DEAL_EXTRA_PARTY_ROLES: DealPartyRole[] = [
  "CHANNEL",
  "THIRD_PARTY",
  "OTHER",
];

export type DealPartyDraft = {
  key: string;
  customerId: string;
  customerName: string;
  role: DealPartyRole;
  note: string;
};

export function parseDealPartiesJson(raw: string | null | undefined): Array<{
  customerId: string;
  role: DealPartyRole;
  note?: string | null;
}> {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("关联客户数据格式无效");
  }
  if (!Array.isArray(parsed)) throw new Error("关联客户数据格式无效");

  const roles = new Set<string>(Object.keys(DEAL_PARTY_ROLE_LABELS));
  const rows: Array<{ customerId: string; role: DealPartyRole; note?: string | null }> = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const customerId = String(row.customerId ?? "").trim();
    const role = String(row.role ?? "OTHER").trim() as DealPartyRole;
    const note = String(row.note ?? "").trim() || null;
    if (!customerId) continue;
    if (!roles.has(role)) throw new Error("关联客户角色无效");
    if (seen.has(customerId)) throw new Error("同一客户不能重复关联");
    seen.add(customerId);
    rows.push({ customerId, role, note });
  }
  return rows;
}
