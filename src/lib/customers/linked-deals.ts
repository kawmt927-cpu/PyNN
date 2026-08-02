import type { ContractStatus, DealPartyRole, OpportunityStatus, UserRole } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { contractListWhere, opportunityListWhere } from "@/lib/opportunities/access";
import { excludeRejectedFromContractList } from "@/lib/contracts/access";
import { DEAL_PARTY_ROLE_LABELS } from "@/lib/deals/party-roles";

export type CustomerLinkedOpportunity = {
  id: string;
  title: string;
  stage: string;
  status: OpportunityStatus;
  expectedAmount: Decimal;
  expectedCloseDate: Date;
  owner: { name: string };
  /** 该客户在此商机上的角色文案 */
  relationRoles: string[];
};

export type CustomerLinkedContract = {
  id: string;
  title: string;
  totalAmount: Decimal;
  status: ContractStatus;
  signedAt: Date | null;
  owner: { name: string };
  opportunity: { id: string; title: string } | null;
  signCustomerId: string;
  endUserCustomerId: string;
  /** 该客户在此合同上的角色文案 */
  relationRoles: string[];
};

function uniqueRoles(roles: string[]) {
  return [...new Set(roles.filter(Boolean))];
}

function partyRoleLabels(roles: DealPartyRole[]) {
  return roles.map((role) => DEAL_PARTY_ROLE_LABELS[role]);
}

/** 客户详情：主要客户 + 多方关联的商机 */
export async function listOpportunitiesLinkedToCustomer(input: {
  customerId: string;
  role: UserRole;
  userId: string;
  take?: number;
}): Promise<CustomerLinkedOpportunity[]> {
  const rows = await prisma.opportunity.findMany({
    where: {
      AND: [
        opportunityListWhere(input.role, input.userId),
        {
          OR: [
            { customerId: input.customerId },
            { parties: { some: { customerId: input.customerId } } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    ...(input.take != null ? { take: input.take } : {}),
    include: {
      owner: { select: { name: true } },
      parties: {
        where: { customerId: input.customerId },
        select: { role: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    stage: row.stage,
    status: row.status,
    expectedAmount: row.expectedAmount,
    expectedCloseDate: row.expectedCloseDate,
    owner: row.owner,
    relationRoles: uniqueRoles([
      ...(row.customerId === input.customerId ? ["主要客户"] : []),
      ...partyRoleLabels(row.parties.map((p) => p.role)),
    ]),
  }));
}

/** 客户详情：签约/最终用户 + 多方关联的合同 */
export async function listContractsLinkedToCustomer(input: {
  customerId: string;
  role: UserRole;
  userId: string;
  take?: number;
}): Promise<CustomerLinkedContract[]> {
  const rows = await prisma.contract.findMany({
    where: {
      AND: [
        contractListWhere(input.role, input.userId),
        excludeRejectedFromContractList(),
        {
          OR: [
            { signCustomerId: input.customerId },
            { endUserCustomerId: input.customerId },
            { parties: { some: { customerId: input.customerId } } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    ...(input.take != null ? { take: input.take } : {}),
    include: {
      owner: { select: { name: true } },
      opportunity: { select: { id: true, title: true } },
      parties: {
        where: { customerId: input.customerId },
        select: { role: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    totalAmount: row.totalAmount,
    status: row.status,
    signedAt: row.signedAt,
    owner: row.owner,
    opportunity: row.opportunity,
    signCustomerId: row.signCustomerId,
    endUserCustomerId: row.endUserCustomerId,
    relationRoles: uniqueRoles([
      ...(row.signCustomerId === input.customerId ? ["签约客户"] : []),
      ...(row.endUserCustomerId === input.customerId ? ["最终用户"] : []),
      ...partyRoleLabels(row.parties.map((p) => p.role)),
    ]),
  }));
}
