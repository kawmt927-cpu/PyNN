/**
 * 一次性：全国性渠道 KPI 数据对齐（创业慧康挂浙江；电信往来日期修正）
 * 用法：DATABASE_URL="file:./prisma/dev.db" npx tsx scripts/backfill-nationwide-channel-kpi.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const HUIKANG = "cmswrp2f200018lj1ubrh01eg";
const TELECOM = "cmsrgalki0005ql0112dwkuu6";
const SUN = "cmswrp2f700038lj1yqvlai86";
const CHEN = "cmswrp2fe00058lj1fx7psvha";

async function main() {
  const huikang = await p.customer.findUnique({ where: { id: HUIKANG } });
  if (!huikang) {
    console.error("创业慧康客户不存在，跳过");
  } else {
    await p.customer.update({
      where: { id: HUIKANG },
      data: { nationwideChannel: true },
    });
    await p.customerCoverageProvince.deleteMany({ where: { customerId: HUIKANG } });
    await p.customerCoverageProvince.create({
      data: {
        customerId: HUIKANG,
        province: "浙江",
        createdAt: new Date("2026-08-12T02:25:50.814Z"),
      },
    });
    await p.contactResponsibleProvince.deleteMany({
      where: { contactId: { in: [SUN, CHEN] } },
    });
    const sun = await p.contact.findUnique({ where: { id: SUN } });
    const chen = await p.contact.findUnique({ where: { id: CHEN } });
    if (sun) {
      await p.contactResponsibleProvince.create({
        data: {
          contactId: SUN,
          province: "浙江",
          createdAt: new Date("2026-08-12T02:25:50.814Z"),
        },
      });
    }
    if (chen) {
      await p.contactResponsibleProvince.create({
        data: {
          contactId: CHEN,
          province: "浙江",
          createdAt: new Date("2026-07-30T05:17:50.579Z"),
        },
      });
    }
    console.log("✓ 创业慧康：全国性 + 浙江覆盖/负责省");
  }

  const telecom = await p.customer.findUnique({ where: { id: TELECOM } });
  if (!telecom) {
    console.error("电信客户不存在，跳过");
  } else {
    const fu = await p.followUp.findFirst({
      where: { customerId: TELECOM },
      orderBy: { createdAt: "asc" },
    });
    if (fu && fu.followUpAt.getFullYear() === 2025) {
      await p.followUp.update({
        where: { id: fu.id },
        data: { followUpAt: new Date("2026-08-13T11:44:00.000Z") },
      });
      console.log("✓ 电信往来日期已改为 2026-08-13", fu.id);
    } else {
      console.log("电信往来无需修正", fu?.followUpAt);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
