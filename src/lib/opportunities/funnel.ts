import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type FunnelRow = {
  stage: string;
  count: number;
  totalAmount: Prisma.Decimal;
};

export async function getOpportunityFunnelSummary(where: Prisma.OpportunityWhereInput) {
  const rows = await prisma.opportunity.groupBy({
    by: ["stage"],
    where: { ...where, status: "NOT_SIGNED" },
    _count: { _all: true },
    _sum: { expectedAmount: true },
  });

  return rows
    .map((row) => ({
      stage: row.stage,
      count: row._count._all,
      totalAmount: row._sum.expectedAmount ?? new Prisma.Decimal(0),
    }))
    .sort((a, b) => a.stage.localeCompare(b.stage)) satisfies FunnelRow[];
}

export function formatAmount(amount: Prisma.Decimal | number) {
  const n = typeof amount === "number" ? amount : Number(amount);
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(n);
}
