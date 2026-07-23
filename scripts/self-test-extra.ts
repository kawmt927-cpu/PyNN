import { PrismaClient } from "@prisma/client";
import { createCustomerRecord } from "../src/lib/customers/create-customer";
import { getConfigOptions, CONFIG_CATEGORY } from "../src/lib/config-options";
import { deleteSalesCheckIn } from "../src/lib/sales-log/check-in";

const prisma = new PrismaClient();
const bugs: string[] = [];

async function main() {
  const sales = await prisma.user.findFirst({ where: { name: "钱金明" } });
  const sales2 = await prisma.user.findFirst({ where: { name: "沈伟" } });
  if (!sales || !sales2) throw new Error("missing users");

  const types = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  const sources = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE);
  const customerType = types.find((t) => t.value === "DIRECT")!.value;
  const source = sources[0]!.value;

  const c = await createCustomerRecord("SALES", sales.id, {
    name: `[健壮] 销售指定他人负责人 ${Date.now()}`,
    category: "COMPANY",
    source,
    customerType,
    customerGrade: "STAR_1",
    ownerId: sales2.id,
    tagValues: [],
  });
  const row = await prisma.customer.findUnique({ where: { id: c.id } });
  if (row?.ownerId !== sales.id) {
    bugs.push(`SALES 新建客户时可通过 ownerId 指定他人为负责人（实际 owner=${row?.ownerId}）`);
  } else {
    console.log("OK sales ownerId forced to self");
  }

  const victim = await prisma.salesCheckIn.findFirst({
    where: { userId: sales.id },
    orderBy: { checkedInAt: "desc" },
  });
  if (victim) {
    try {
      await deleteSalesCheckIn({
        role: "SALES",
        userId: sales2.id,
        checkInId: victim.id,
      });
      bugs.push("销售可删除他人打卡（deleteSalesCheckIn 未拦截）");
    } catch (e) {
      console.log("OK cannot delete others check-in:", (e as Error).message.slice(0, 80));
    }
  }

  try {
    await createCustomerRecord("SALES", sales.id, {
      name: "   ",
      category: "COMPANY",
      source,
      customerType,
      customerGrade: "NONE",
      tagValues: [],
    });
    bugs.push("空白名称客户仍可创建");
  } catch (e) {
    console.log("OK blank name rejected:", (e as Error).message.slice(0, 80));
  }

  try {
    const long = "超".repeat(5000);
    await createCustomerRecord("SALES", sales.id, {
      name: `[健壮] ${long}`,
      category: "COMPANY",
      source,
      customerType,
      customerGrade: "NONE",
      tagValues: [],
    });
    bugs.push("超长客户名仍可写入");
  } catch (e) {
    console.log("OK long name rejected:", (e as Error).message.slice(0, 80));
  }

  try {
    await createCustomerRecord("SALES", sales.id, {
      name: "\t\n  ",
      category: "COMPANY",
      source,
      customerType,
      customerGrade: "NONE",
      tagValues: [],
    });
    bugs.push("空白字符客户名仍可入库");
  } catch (e) {
    console.log("OK whitespace name rejected:", (e as Error).message.slice(0, 80));
  }

  console.log("\nEXTRA_BUGS=" + JSON.stringify(bugs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
