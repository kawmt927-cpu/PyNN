import { prisma } from "@/lib/prisma";

export type SameCustomerTitleOpportunity = {
  id: string;
  title: string;
  status: string;
  ownerName: string | null;
  createdAt: Date;
};

/** 同客户 + 同标题（去首尾空格）的未删除商机 */
export async function findSameCustomerSameTitleOpportunities(input: {
  customerId: string;
  title: string;
  excludeId?: string;
}): Promise<SameCustomerTitleOpportunity[]> {
  const title = input.title.trim();
  if (!input.customerId || !title) return [];

  const rows = await prisma.opportunity.findMany({
    where: {
      customerId: input.customerId,
      confirmStatus: { not: "REJECTED" },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return rows
    .filter((row) => row.title.trim() === title)
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      ownerName: row.owner?.name ?? null,
      createdAt: row.createdAt,
    }));
}

export function formatDuplicateOpportunityConfirmMessage(
  title: string,
  customerName: string | null,
  duplicates: SameCustomerTitleOpportunity[]
) {
  const who = customerName?.trim() || "该客户";
  const first = duplicates[0];
  const extra =
    duplicates.length > 1 ? `（另有 ${duplicates.length - 1} 条同名）` : "";
  const owner = first?.ownerName ? `，负责销售 ${first.ownerName}` : "";
  return `客户「${who}」已存在同名商机「${title}」${owner}${extra}。确认仍要再建一条吗？`;
}
