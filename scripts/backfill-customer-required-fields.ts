/**
 * 为缺少关系类型 / 客户等级的客户随机补全有效配置值。
 * 用法: npx tsx scripts/backfill-customer-required-fields.ts
 */
import { PrismaClient } from "@prisma/client";
import { CUSTOMER_GRADE_OPTIONS } from "../src/lib/customers/grade";
import { CONFIG_CATEGORY } from "../src/lib/config-options";

const prisma = new PrismaClient();

const TYPE_FALLBACK = ["DIRECT", "CHANNEL", "PARTNER"] as const;
const GRADE_VALUES = CUSTOMER_GRADE_OPTIONS.map((option) => option.value);

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function isBlank(value: string | null | undefined) {
  return !value?.trim();
}

async function loadEnabledTypeValues(): Promise<string[]> {
  const rows = await prisma.configOption.findMany({
    where: { category: CONFIG_CATEGORY.CUSTOMER_TYPE, enabled: true },
    select: { value: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.length > 0 ? rows.map((row) => row.value) : [...TYPE_FALLBACK];
}

async function main() {
  const typeValues = await loadEnabledTypeValues();
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, customerType: true, customerGrade: true },
  });

  let updatedType = 0;
  let updatedGrade = 0;

  for (const customer of customers) {
    const data: { customerType?: string; customerGrade?: string } = {};

    if (isBlank(customer.customerType)) {
      data.customerType = pickRandom(typeValues);
      updatedType += 1;
    }
    if (isBlank(customer.customerGrade)) {
      data.customerGrade = pickRandom(GRADE_VALUES);
      updatedGrade += 1;
    }

    if (Object.keys(data).length > 0) {
      await prisma.customer.update({ where: { id: customer.id }, data });
    }
  }

  console.log(
    JSON.stringify(
      {
        totalCustomers: customers.length,
        filledCustomerType: updatedType,
        filledCustomerGrade: updatedGrade,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
