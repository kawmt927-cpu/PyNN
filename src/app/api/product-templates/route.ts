import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const items = await prisma.productServiceTemplate.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      baselineCostPrice: true,
    },
  });

  return NextResponse.json({
    items: items.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      defaultCost: Number(row.baselineCostPrice),
    })),
  });
}
