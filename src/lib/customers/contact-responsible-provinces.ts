import { prisma } from "@/lib/prisma";
import { normalizeProvinceName, UNASSIGNED_PROVINCE } from "@/lib/admin/channel-dashboard";

/** 增量更新负责省：保留已有行的 createdAt（KPI 按首次挂省时间计） */
export async function replaceContactResponsibleProvinces(
  contactId: string,
  provinces: string[]
) {
  const normalized = [
    ...new Set(
      provinces
        .map((p) => normalizeProvinceName(p))
        .filter((p) => p && p !== UNASSIGNED_PROVINCE)
    ),
  ];

  const existing = await prisma.contactResponsibleProvince.findMany({
    where: { contactId },
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
      await tx.contactResponsibleProvince.deleteMany({
        where: { contactId, province: { in: toRemove } },
      });
    }
    if (toAdd.length > 0) {
      await tx.contactResponsibleProvince.createMany({
        data: toAdd.map((province) => ({ contactId, province })),
      });
    }
  });
}

export function parseResponsibleProvincesFromForm(formData: FormData): string[] {
  return formData
    .getAll("responsibleProvinces")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
}
