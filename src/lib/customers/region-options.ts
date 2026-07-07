import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

async function distinctProvinces(baseWhere: Prisma.CustomerWhereInput): Promise<string[]> {
  const rows = await prisma.customer.findMany({
    where: { ...baseWhere, province: { not: null } },
    distinct: ["province"],
    select: { province: true },
    orderBy: { province: "asc" },
  });
  return rows.map((row) => row.province).filter((value): value is string => Boolean(value?.trim()));
}

async function distinctCities(
  baseWhere: Prisma.CustomerWhereInput,
  province: string
): Promise<string[]> {
  const rows = await prisma.customer.findMany({
    where: { ...baseWhere, province, city: { not: null } },
    distinct: ["city"],
    select: { city: true },
    orderBy: { city: "asc" },
  });
  return rows.map((row) => row.city).filter((value): value is string => Boolean(value?.trim()));
}

async function distinctDistricts(
  baseWhere: Prisma.CustomerWhereInput,
  province: string,
  city: string
): Promise<string[]> {
  const rows = await prisma.customer.findMany({
    where: { ...baseWhere, province, city, district: { not: null } },
    distinct: ["district"],
    select: { district: true },
    orderBy: { district: "asc" },
  });
  return rows.map((row) => row.district).filter((value): value is string => Boolean(value?.trim()));
}

export async function getCustomerRegionOptions(
  baseWhere: Prisma.CustomerWhereInput,
  province?: string,
  city?: string
) {
  const [provinces, cities, districts] = await Promise.all([
    distinctProvinces(baseWhere),
    province ? distinctCities(baseWhere, province) : Promise.resolve([] as string[]),
    province && city
      ? distinctDistricts(baseWhere, province, city)
      : Promise.resolve([] as string[]),
  ]);

  return { provinces, cities, districts };
}
