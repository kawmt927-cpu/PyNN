import type { DealPartyRole, Prisma } from "@prisma/client";
import { parseDealPartiesJson } from "@/lib/deals/party-roles";

export function readPartiesFromFormData(formData: FormData) {
  return parseDealPartiesJson(String(formData.get("partiesJson") ?? ""));
}

export function assertPartiesNotOverlappingPrimary(
  parties: Array<{ customerId: string }>,
  primaryCustomerId: string | null | undefined
) {
  if (!primaryCustomerId) return;
  if (parties.some((p) => p.customerId === primaryCustomerId)) {
    throw new Error("关联客户不能与主要客户重复");
  }
}

export async function replaceOpportunityParties(
  tx: Prisma.TransactionClient,
  opportunityId: string,
  parties: Array<{ customerId: string; role: DealPartyRole; note?: string | null }>
) {
  await tx.opportunityParty.deleteMany({ where: { opportunityId } });
  if (parties.length === 0) return;
  await tx.opportunityParty.createMany({
    data: parties.map((p) => ({
      opportunityId,
      customerId: p.customerId,
      role: p.role === "PRIMARY" ? "OTHER" : p.role,
      note: p.note ?? null,
    })),
  });
}

export async function replaceContractParties(
  tx: Prisma.TransactionClient,
  contractId: string,
  parties: Array<{ customerId: string; role: DealPartyRole; note?: string | null }>,
  reservedCustomerIds: Array<string | null | undefined>
) {
  const reserved = new Set(reservedCustomerIds.filter(Boolean) as string[]);
  for (const p of parties) {
    if (reserved.has(p.customerId)) {
      throw new Error("额外关联客户不能与签约客户或最终用户重复");
    }
  }
  await tx.contractParty.deleteMany({ where: { contractId } });
  if (parties.length === 0) return;
  await tx.contractParty.createMany({
    data: parties.map((p) => ({
      contractId,
      customerId: p.customerId,
      role: p.role === "PRIMARY" ? "OTHER" : p.role,
      note: p.note ?? null,
    })),
  });
}
