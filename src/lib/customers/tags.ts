import { CONFIG_CATEGORY } from "@/lib/config-options";
import { getPrismaClient } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_TAG_COLOR_OPTIONS,
  DEFAULT_TAG_COLOR,
  getTagTextColor,
  normalizeTagColor,
} from "@/lib/customers/tag-colors";

export type CustomerTagDefinition = {
  value: string;
  label: string;
  color: string;
  textColor: string;
};

export { DEFAULT_TAG_COLOR, normalizeTagColor } from "@/lib/customers/tag-colors";

export async function ensureCustomerTagDefaults() {
  const db = getPrismaClient();
  const count = await db.configOption.count({ where: { category: CONFIG_CATEGORY.CUSTOMER_TAG } });
  if (count > 0) return;

  for (const opt of DEFAULT_CUSTOMER_TAG_OPTIONS) {
    await db.configOption.upsert({
      where: { category_value: { category: opt.category, value: opt.value } },
      update: {},
      create: {
        category: opt.category,
        value: opt.value,
        label: opt.label,
        color: opt.color,
        sortOrder: opt.sortOrder,
      },
    });
  }
}

export async function getCustomerTagDefinitions(): Promise<CustomerTagDefinition[]> {
  await ensureCustomerTagDefaults();
  const rows = await prisma.configOption.findMany({
    where: { category: CONFIG_CATEGORY.CUSTOMER_TAG, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { value: true, label: true, color: true },
  });

  return rows.map((row) => ({
    value: row.value,
    label: row.label,
    color: normalizeTagColor(row.color),
    textColor: getTagTextColor(row.color ?? ""),
  }));
}

export async function assertCustomerTagValues(values: string[] | undefined | null) {
  if (!values?.length) return [];
  const unique = [...new Set(values.filter(Boolean))];
  const definitions = await getCustomerTagDefinitions();
  const allowed = new Set(definitions.map((item) => item.value));
  const invalid = unique.filter((value) => !allowed.has(value));
  if (invalid.length > 0) {
    throw new Error("包含无效的客户标签");
  }
  return unique;
}

export async function replaceCustomerTags(customerId: string, tagValues: string[]) {
  const normalized = await assertCustomerTagValues(tagValues);

  await prisma.$transaction([
    prisma.customerTag.deleteMany({ where: { customerId } }),
    ...(normalized.length
      ? [
          prisma.customerTag.createMany({
            data: normalized.map((tagValue) => ({ customerId, tagValue })),
          }),
        ]
      : []),
  ]);
}

export async function getCustomerTagsMap(customerIds: string[]) {
  if (customerIds.length === 0) return new Map<string, string[]>();

  const rows = await prisma.customerTag.findMany({
    where: { customerId: { in: customerIds } },
    select: { customerId: true, tagValue: true },
  });

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const current = map.get(row.customerId) ?? [];
    current.push(row.tagValue);
    map.set(row.customerId, current);
  }
  return map;
}

export const DEFAULT_CUSTOMER_TAG_OPTIONS = [
  {
    category: "customer_tag" as const,
    value: "TAG_KEY_ACCOUNT",
    label: "重点客户",
    color: CUSTOMER_TAG_COLOR_OPTIONS[1].value,
    sortOrder: 1,
  },
  {
    category: "customer_tag" as const,
    value: "TAG_STRATEGIC",
    label: "战略客户",
    color: CUSTOMER_TAG_COLOR_OPTIONS[6].value,
    sortOrder: 2,
  },
  {
    category: "customer_tag" as const,
    value: "TAG_RISK",
    label: "风险关注",
    color: CUSTOMER_TAG_COLOR_OPTIONS[5].value,
    sortOrder: 3,
  },
] as const;
