/**
 * 为操作手册截图生成演示数据（本地开发）。
 * 运行：npx tsx scripts/seed-manual-demo-data.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCustomerRecord } from "../src/lib/customers/create-customer";
import { createOpportunityFromAgent } from "../src/lib/sales-log/opportunity-write";
import { createSalesCheckIn } from "../src/lib/sales-log/check-in";
import { ensureTodayDailyLog } from "../src/lib/sales-log/daily-log";
import { finalizeSignedContract } from "../src/lib/contracts/finalize";
import { CONFIG_CATEGORY, getConfigOptions } from "../src/lib/config-options";
import { addDays, subHours } from "date-fns";

const prisma = new PrismaClient();
const PREFIX = "【手册演示】";

async function main() {
  const sales = await prisma.user.findFirst({ where: { name: "钱金明", role: "SALES" } });
  const sales2 = await prisma.user.findFirst({ where: { name: "沈伟", role: "SALES" } });
  const manager = await prisma.user.findFirst({
    where: { name: "蔡晗蕾", role: "SALES_MANAGER" },
  });
  if (!sales || !sales2 || !manager) throw new Error("缺少销售/销管账号");

  // 清理旧演示数据（按名称前缀）
  const oldCustomers = await prisma.customer.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true },
  });
  const oldIds = oldCustomers.map((c) => c.id);
  if (oldIds.length) {
    await prisma.customerClaimRequest.deleteMany({ where: { customerId: { in: oldIds } } });
    await prisma.salesCheckIn.deleteMany({ where: { customerId: { in: oldIds } } });
    await prisma.followUp.deleteMany({ where: { customerId: { in: oldIds } } });
    const oldOpps = await prisma.opportunity.findMany({
      where: { customerId: { in: oldIds } },
      select: { id: true },
    });
    const oldOppIds = oldOpps.map((o) => o.id);
    const oldContracts = await prisma.contract.findMany({
      where: {
        OR: [{ signCustomerId: { in: oldIds } }, { opportunityId: { in: oldOppIds } }],
      },
      select: { id: true },
    });
    const oldContractIds = oldContracts.map((c) => c.id);
    if (oldContractIds.length) {
      await prisma.project.deleteMany({ where: { contractId: { in: oldContractIds } } });
      await prisma.contract.deleteMany({ where: { id: { in: oldContractIds } } });
    }
    if (oldOppIds.length) {
      await prisma.opportunityStageLog.deleteMany({ where: { opportunityId: { in: oldOppIds } } });
      await prisma.opportunity.deleteMany({ where: { id: { in: oldOppIds } } });
    }
    await prisma.contact.deleteMany({ where: { customerId: { in: oldIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: oldIds } } });
    console.log(`已清理旧演示客户 ${oldIds.length} 个`);
  }

  const typeOpts = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  const sourceOpts = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE);
  const stageOpts = await getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE);
  const customerType = typeOpts.find((o) => o.value === "DIRECT")?.value ?? typeOpts[0]!.value;
  const source = sourceOpts[0]!.value;
  const stageInitial = stageOpts.find((o) => o.value === "INITIAL_VISIT")?.value ?? stageOpts[0]!.value;
  const stageNeeds = stageOpts.find((o) => o.value === "NEEDS_CONFIRM")?.value ?? stageOpts[1]!.value;

  // —— 客户 ——
  const hospital = await createCustomerRecord("SALES", sales.id, {
    name: `${PREFIX}杭州市第一人民医院`,
    category: "HOSPITAL",
    hospitalLevel: "GRADE_3A",
    source,
    customerType,
    customerGrade: "STAR_3",
    province: "浙江省",
    city: "杭州市",
    district: "上城区",
    bedCount: 1200,
    existingSystem: "旧版 HIS",
    notes: "手册演示：重点跟进客户",
    tagValues: [],
  });
  const company = await createCustomerRecord("SALES", sales.id, {
    name: `${PREFIX}浙里健康科技有限公司`,
    category: "COMPANY",
    source,
    customerType,
    customerGrade: "STAR_2",
    province: "浙江省",
    city: "杭州市",
    notes: "手册演示：渠道/合作对象",
    tagValues: [],
  });
  const pool = await createCustomerRecord("SALES_MANAGER", manager.id, {
    name: `${PREFIX}公海-某市中医院`,
    category: "HOSPITAL",
    hospitalLevel: "GRADE_2A",
    source,
    customerType,
    customerGrade: "STAR_1",
    province: "浙江省",
    city: "宁波市",
    ownerId: null,
    notes: "手册演示：公海可认领",
    tagValues: [],
  });
  const sales2Cust = await createCustomerRecord("SALES", sales2.id, {
    name: `${PREFIX}沈伟负责-西湖区社区卫生中心`,
    category: "HOSPITAL",
    hospitalLevel: "GRADE_2",
    source,
    customerType,
    customerGrade: "STAR_1",
    province: "浙江省",
    city: "杭州市",
    tagValues: [],
  });

  const contactH = await prisma.contact.create({
    data: {
      customerId: hospital.id,
      name: "李信息",
      title: "IT_DIRECTOR",
      department: "IT",
      phone: "13800001111",
      isPrimary: true,
    },
  });
  await prisma.contact.create({
    data: {
      customerId: hospital.id,
      name: "王院长",
      title: "DEAN",
      phone: "13800001112",
    },
  });
  const contactC = await prisma.contact.create({
    data: {
      customerId: company.id,
      name: "赵经理",
      phone: "13800002222",
      isPrimary: true,
    },
  });

  // —— 商机 ——
  const daily = await ensureTodayDailyLog(sales.id);
  const opp1 = await createOpportunityFromAgent(
    { userId: sales.id, role: "SALES", dailyLogId: daily.id },
    {
      title: `${PREFIX}市一 HIS 升级改造`,
      customerId: hospital.id,
      stage: stageNeeds,
      expectedAmount: 680000,
      expectedCloseDate: "2026-09",
      requirementDesc: "替换核心 HIS，含门诊+住院",
    }
  );
  const opp2 = await createOpportunityFromAgent(
    { userId: sales.id, role: "SALES", dailyLogId: daily.id },
    {
      title: `${PREFIX}浙里健康接口集成`,
      customerId: company.id,
      stage: stageInitial,
      expectedAmount: 120000,
      expectedCloseDate: "2026-11",
    }
  );

  // —— 打卡 / 往来 ——
  await createSalesCheckIn({
    userId: sales.id,
    role: "SALES",
    checkInMode: "interaction",
    customerId: hospital.id,
    contactIds: [contactH.id],
    latitude: 30.2741,
    longitude: 120.1551,
    locationText: "杭州市上城区医院路1号",
    addressProvince: "浙江省",
    addressCity: "杭州市",
    addressDistrict: "上城区",
    completeInteractionNow: true,
    followUp: {
      method: "FACE_VISIT",
      content: "与信息科确认 HIS 招标时间表，对方希望三季度启动。",
      nextFollowUpAt: addDays(new Date(), 7).toISOString().slice(0, 10),
      nextFollowUpMethod: "WECHAT",
      nextFollowUpContent: "跟进招标文件草稿",
    },
  });
  await createSalesCheckIn({
    userId: sales.id,
    role: "SALES",
    checkInMode: "interaction",
    customerId: company.id,
    contactIds: [contactC.id],
    latitude: 30.28,
    longitude: 120.16,
    locationText: "杭州市西湖区文一西路",
    completeInteractionNow: false,
  });
  await createSalesCheckIn({
    userId: sales.id,
    role: "SALES",
    checkInMode: "without_customer",
    latitude: 30.25,
    longitude: 120.12,
    locationText: "路过滨江演示点",
  });

  // 待完善日报
  await prisma.salesDailyLog.update({
    where: { id: daily.id },
    data: {
      status: "PENDING_CONFIRM",
      dailyReport: "今日拜访市一人民医院与浙里健康，推进 HIS 升级商机。",
    },
  });

  // —— 公海认领（待审） ——
  await prisma.customerClaimRequest.create({
    data: {
      customerId: pool.id,
      requesterId: sales.id,
      message: "已有当地渠道线索，申请认领跟进",
      status: "PENDING",
    },
  });

  // —— 合同：一单待审 + 一单已签建项 ——
  const pendingContract = await prisma.contract.create({
    data: {
      title: `${PREFIX}浙里健康接口合同（待审）`,
      signingType: "DIRECT",
      status: "PENDING_APPROVAL",
      totalAmount: 120000,
      ownerId: sales.id,
      signCustomerId: company.id,
      endUserCustomerId: company.id,
      opportunityId: opp2.opportunityId,
      submittedById: sales.id,
      submittedAt: new Date(),
      products: {
        create: [
          {
            productName: "接口集成服务",
            salesAmount: 120000,
            costAmount: 40000,
          },
        ],
      },
      installments: {
        create: [
          { periodNumber: 1, amount: 60000, condition: "签约支付" },
          { periodNumber: 2, amount: 60000, condition: "验收支付" },
        ],
      },
    },
  });

  const signedContract = await prisma.contract.create({
    data: {
      title: `${PREFIX}市一 HIS 升级合同`,
      signingType: "DIRECT",
      status: "PENDING_APPROVAL",
      totalAmount: 680000,
      ownerId: sales.id,
      signCustomerId: hospital.id,
      endUserCustomerId: hospital.id,
      opportunityId: opp1.opportunityId,
      submittedById: sales.id,
      submittedAt: subHours(new Date(), 24),
      products: {
        create: [
          {
            productName: "HIS 核心模块",
            salesAmount: 500000,
            costAmount: 180000,
          },
          {
            productName: "实施服务",
            salesAmount: 180000,
            costAmount: 90000,
          },
        ],
      },
      installments: {
        create: [
          { periodNumber: 1, amount: 200000, condition: "签约" },
          { periodNumber: 2, amount: 300000, condition: "上线" },
          { periodNumber: 3, amount: 180000, condition: "质保期满" },
        ],
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await finalizeSignedContract(tx, {
      contractId: signedContract.id,
      signedAt: new Date(),
      approverId: manager.id,
    });
  });

  const project = await prisma.project.findUnique({
    where: { contractId: signedContract.id },
  });

  // 挂计划日期 + 简单阶段，便于项目计划截图（含甘特）
  if (project) {
    const start = new Date();
    const end = addDays(new Date(), 90);
    await prisma.project.update({
      where: { id: project.id },
      data: { plannedStartAt: start, plannedEndAt: end },
    });
    const phase = await prisma.projectPhase.create({
      data: {
        projectId: project.id,
        name: "需求调研",
        sortOrder: 1,
        plannedStartAt: start,
        plannedEndAt: addDays(start, 30),
      },
    });
    await prisma.projectTask.create({
      data: {
        projectId: project.id,
        phaseId: phase.id,
        name: "现场调研与现状梳理",
        sortOrder: 1,
        status: "NOT_STARTED",
        plannedStartAt: start,
        plannedEndAt: addDays(start, 30),
      },
    });
  }

  // 销管今日可见的另一条团队日报（沈伟）
  const daily2 = await ensureTodayDailyLog(sales2.id);
  await prisma.salesDailyLog.update({
    where: { id: daily2.id },
    data: {
      status: "SUBMITTED",
      dailyReport: "今日跟进社区卫生中心设备巡检，无新增商机。",
      submittedAt: new Date(),
    },
  });

  console.log(
    JSON.stringify(
      {
        customers: {
          hospital: hospital.id,
          company: company.id,
          pool: pool.id,
          sales2: sales2Cust.id,
        },
        opportunities: { opp1: opp1.opportunityId, opp2: opp2.opportunityId },
        contracts: { pending: pendingContract.id, signed: signedContract.id },
        project: project?.id ?? null,
      },
      null,
      2
    )
  );
  console.log("演示数据已就绪。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
