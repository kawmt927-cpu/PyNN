import { prisma } from "@/lib/prisma";
import { normalizeProvinceName, UNASSIGNED_PROVINCE } from "@/lib/admin/channel-dashboard";

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

  await prisma.$transaction(async (tx) => {
    await tx.customerCoverageProvince.deleteMany({ where: { customerId } });
    if (normalized.length === 0) return;
    await tx.customerCoverageProvince.createMany({
      data: normalized.map((province) => ({ customerId, province })),
    });
  });
}

export function parseCoverageProvincesFromForm(formData: FormData): string[] {
  return formData
    .getAll("coverageProvinces")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
}
