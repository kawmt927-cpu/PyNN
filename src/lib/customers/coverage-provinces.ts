import { prisma } from "@/lib/prisma";
import { normalizeProvinceName, UNASSIGNED_PROVINCE } from "@/lib/admin/channel-dashboard";

/** 增量更新覆盖省：保留已有行的 createdAt（KPI 按首次挂省时间计） */
export async function replaceCustomerCoverageProvinces(
  customerId: string,
  provinces: string[]
) {
  const normalized = [
    ...new Set(
      provinces
        .map((p) => normalizeProvinceName(p))
        .filter((p) => p && p !== UNASSIGNED_PROVINCE)
    ),
  ];

  const existing = await prisma.customerCoverageProvince.findMany({
    where: { customerId },
    select: { province: true },
  });
  const existingSet = new Set(existing.map((row) => row.province));
  const nextSet = new Set(normalized);
  const toAdd = normalized.filter((province) => !existingSet.has(province));
  const toRemove = existing
    .map((row) => row.province)
    .filter((province) => !nextSet.has(province));

  await prisma.$transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx.customerCoverageProvince.deleteMany({
        where: { customerId, province: { in: toRemove } },
      });
    }
    if (toAdd.length > 0) {
      await tx.customerCoverageProvince.createMany({
        data: toAdd.map((province) => ({ customerId, province })),
      });
    }
  });
}

export function parseCoverageProvincesFromForm(formData: FormData): string[] {
  return formData
    .getAll("coverageProvinces")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
}
