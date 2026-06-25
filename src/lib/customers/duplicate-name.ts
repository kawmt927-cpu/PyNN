import { normalizeOrgName } from "@/lib/search/fuzzy-text";
import { prisma } from "@/lib/prisma";

export function customerNameMatchKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return normalizeOrgName(trimmed) || trimmed;
}

export function isSameCustomerName(a: string, b: string): boolean {
  const left = customerNameMatchKey(a);
  const right = customerNameMatchKey(b);
  if (!left || !right) return false;
  return left === right || a.trim() === b.trim();
}

/** 按名称去重，保留排序靠前的一条 */
export function dedupeCustomersByName<T extends { id: string; name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    const key = customerNameMatchKey(row.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

export async function findDuplicateCustomerByName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exact = await prisma.customer.findFirst({
    where: { name: trimmed },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
  if (exact) return exact;

  const key = customerNameMatchKey(trimmed);
  if (key.length < 2) return null;

  const prefix = key.slice(0, Math.min(4, key.length));
  const candidates = await prisma.customer.findMany({
    where: { name: { contains: prefix } },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return candidates.find((row) => isSameCustomerName(row.name, trimmed)) ?? null;
}

export async function assertCustomerNameAvailable(name: string): Promise<void> {
  const duplicate = await findDuplicateCustomerByName(name);
  if (duplicate) {
    throw new Error(`客户「${duplicate.name}」已存在，请直接搜索选择`);
  }
}
