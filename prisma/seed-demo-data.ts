/**
 * 演示数据：三位销售 + 各自客户 / 商机 / 合同
 * 运行：npm run db:seed:demo
 * 可重复执行（固定 ID upsert）
 */
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  UserRole,
  StaffCategory,
  ContractStatus,
  OpportunityStatus,
  SigningType,
} from "@prisma/client";

const prisma = new PrismaClient();

const SALES_PASSWORD = "sales123";

type SalesSeed = {
  email: string;
  name: string;
  prefix: "zhang" | "li" | "wang";
};

const SALES_REPS: SalesSeed[] = [
  { email: "sales1@example.com", name: "张销售", prefix: "zhang" },
  { email: "sales2@example.com", name: "李销售", prefix: "li" },
  { email: "sales3@example.com", name: "王销售", prefix: "wang" },
];

/** 兼容旧种子账号 sales@example.com → 等同 sales1 */
const LEGACY_SALES_EMAIL = "sales@example.com";

type CustomerSeed = {
  id: string;
  name: string;
  province: string;
  city: string;
  hospitalLevel: "GRADE_3A" | "GRADE_3B" | "GRADE_2A";
  bedCount: number;
  contact: { id: string; name: string; title: string; phone: string };
};

type OpportunitySeed = {
  id: string;
  customerId: string;
  title: string;
  amount: number;
  stage: string;
  status: OpportunityStatus;
  monthsFromNow: number;
};

type ContractSeed = {
  id: string;
  customerId: string;
  contactId: string;
  opportunityId?: string;
  title: string;
  amount: number;
  status: ContractStatus;
  signedDaysAgo?: number;
  /** 已签署合同的回款合计（瀑布展示用） */
  paidAmount?: number;
  rejectReason?: string;
};

const DEMO_BY_SALES: Record<
  SalesSeed["prefix"],
  {
    customers: CustomerSeed[];
    opportunities: OpportunitySeed[];
    contracts: ContractSeed[];
  }
> = {
  zhang: {
    customers: [
      {
        id: "demo-cust-zhang-1",
        name: "南京市第一医院",
        province: "江苏省",
        city: "南京市",
        hospitalLevel: "GRADE_3A",
        bedCount: 1800,
        contact: {
          id: "demo-contact-zhang-1",
          name: "陈主任",
          title: "信息科主任",
          phone: "13800001001",
        },
      },
      {
        id: "demo-cust-zhang-2",
        name: "苏州大学附属第一医院",
        province: "江苏省",
        city: "苏州市",
        hospitalLevel: "GRADE_3A",
        bedCount: 2200,
        contact: {
          id: "demo-contact-zhang-2",
          name: "刘院长",
          title: "副院长",
          phone: "13800001002",
        },
      },
    ],
    opportunities: [
      {
        id: "demo-opp-zhang-1",
        customerId: "demo-cust-zhang-1",
        title: "HIS 系统升级项目",
        amount: 2800000,
        stage: "NEGOTIATION",
        status: "NOT_SIGNED",
        monthsFromNow: 2,
      },
      {
        id: "demo-opp-zhang-2",
        customerId: "demo-cust-zhang-2",
        title: "电子病历二期建设",
        amount: 1500000,
        stage: "QUOTATION",
        status: "SIGNED",
        monthsFromNow: 1,
      },
    ],
    contracts: [
      {
        id: "demo-contract-zhang-pending",
        customerId: "demo-cust-zhang-1",
        contactId: "demo-contact-zhang-1",
        opportunityId: "demo-opp-zhang-1",
        title: "南京市第一医院 HIS 升级合同",
        amount: 2800000,
        status: "PENDING_APPROVAL",
        signedDaysAgo: 3,
      },
      {
        id: "demo-contract-zhang-signed",
        customerId: "demo-cust-zhang-2",
        contactId: "demo-contact-zhang-2",
        opportunityId: "demo-opp-zhang-2",
        title: "苏大附一院电子病历合同",
        amount: 1500000,
        status: "SIGNED_PENDING_IMPL",
        signedDaysAgo: 45,
        paidAmount: 750000,
      },
    ],
  },
  li: {
    customers: [
      {
        id: "demo-cust-li-1",
        name: "无锡市人民医院",
        province: "江苏省",
        city: "无锡市",
        hospitalLevel: "GRADE_3A",
        bedCount: 1600,
        contact: {
          id: "demo-contact-li-1",
          name: "周科长",
          title: "医务科科长",
          phone: "13800002001",
        },
      },
      {
        id: "demo-cust-li-2",
        name: "常州市第二人民医院",
        province: "江苏省",
        city: "常州市",
        hospitalLevel: "GRADE_3B",
        bedCount: 1200,
        contact: {
          id: "demo-contact-li-2",
          name: "吴主任",
          title: "采购中心主任",
          phone: "13800002002",
        },
      },
    ],
    opportunities: [
      {
        id: "demo-opp-li-1",
        customerId: "demo-cust-li-1",
        title: "智慧病房建设项目",
        amount: 980000,
        stage: "QUOTATION",
        status: "NOT_SIGNED",
        monthsFromNow: 3,
      },
      {
        id: "demo-opp-li-2",
        customerId: "demo-cust-li-2",
        title: "集成平台与数据中台",
        amount: 2200000,
        stage: "NEGOTIATION",
        status: "SIGNED",
        monthsFromNow: 2,
      },
    ],
    contracts: [
      {
        id: "demo-contract-li-signed",
        customerId: "demo-cust-li-2",
        contactId: "demo-contact-li-2",
        opportunityId: "demo-opp-li-2",
        title: "常州二院集成平台合同",
        amount: 2200000,
        status: "SIGNED_PENDING_IMPL",
        signedDaysAgo: 30,
        paidAmount: 1500000,
      },
      {
        id: "demo-contract-li-rejected",
        customerId: "demo-cust-li-1",
        contactId: "demo-contact-li-1",
        title: "无锡人医智慧病房合同（驳回样例）",
        amount: 980000,
        status: "REJECTED",
        signedDaysAgo: 10,
        rejectReason: "合同金额与报价单不一致，请核对后重新提交。",
      },
    ],
  },
  wang: {
    customers: [
      {
        id: "demo-cust-wang-1",
        name: "南通大学附属医院",
        province: "江苏省",
        city: "南通市",
        hospitalLevel: "GRADE_3A",
        bedCount: 1900,
        contact: {
          id: "demo-contact-wang-1",
          name: "郑主任",
          title: "设备科科长",
          phone: "13800003001",
        },
      },
      {
        id: "demo-cust-wang-2",
        name: "镇江市第一人民医院",
        province: "江苏省",
        city: "镇江市",
        hospitalLevel: "GRADE_2A",
        bedCount: 900,
        contact: {
          id: "demo-contact-wang-2",
          name: "孙经理",
          title: "运营部经理",
          phone: "13800003002",
        },
      },
    ],
    opportunities: [
      {
        id: "demo-opp-wang-1",
        customerId: "demo-cust-wang-1",
        title: "PACS 与影像归档对接",
        amount: 680000,
        stage: "PROPOSAL",
        status: "NOT_SIGNED",
        monthsFromNow: 4,
      },
      {
        id: "demo-opp-wang-2",
        customerId: "demo-cust-wang-2",
        title: "门诊预约系统改造",
        amount: 420000,
        stage: "NEEDS_CONFIRM",
        status: "NOT_SIGNED",
        monthsFromNow: 2,
      },
    ],
    contracts: [
      {
        id: "demo-contract-wang-pending",
        customerId: "demo-cust-wang-1",
        contactId: "demo-contact-wang-1",
        title: "南通附院 PACS 对接合同",
        amount: 680000,
        status: "PENDING_APPROVAL",
        signedDaysAgo: 1,
      },
    ],
  },
};

function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function ensureSalesUsers() {
  const passwordHash = await bcrypt.hash(SALES_PASSWORD, 10);
  const users: Record<string, string> = {};

  for (const rep of SALES_REPS) {
    const phone =
      rep.email === "sales1@example.com"
        ? "13800000011"
        : rep.email === "sales2@example.com"
          ? "13800000012"
          : "13800000013";
    const user = await prisma.user.upsert({
      where: { email: rep.email },
      update: { name: rep.name, phone },
      create: {
        email: rep.email,
        phone,
        name: rep.name,
        passwordHash,
        role: UserRole.SALES,
        personnelProfile: {
          create: { staffCategory: StaffCategory.SALES, enabled: true },
        },
      },
    });
    users[rep.prefix] = user.id;
  }

  const manager = await prisma.user.findUnique({ where: { email: "salesmgr@example.com" } });
  if (!manager) {
    throw new Error("请先运行 npm run db:seed 创建销售管理账号");
  }

  return { users, managerId: manager.id };
}

async function upsertCustomer(ownerId: string, row: CustomerSeed) {
  await prisma.customer.upsert({
    where: { id: row.id },
    update: {
      name: row.name,
      ownerId,
      province: row.province,
      city: row.city,
    },
    create: {
      id: row.id,
      name: row.name,
      category: "HOSPITAL",
      hospitalLevel: row.hospitalLevel,
      province: row.province,
      city: row.city,
      bedCount: row.bedCount,
      source: "ACTIVE_DEV",
      customerType: "DIRECT",
      customerGrade: "STAR_2",
      ownerId,
    },
  });

  await prisma.contact.upsert({
    where: { id: row.contact.id },
    update: {
      name: row.contact.name,
      title: row.contact.title,
      phone: row.contact.phone,
    },
    create: {
      id: row.contact.id,
      customerId: row.id,
      name: row.contact.name,
      title: row.contact.title,
      phone: row.contact.phone,
      role: "DECISION_MAKER",
      isPrimary: true,
    },
  });
}

async function upsertOpportunity(ownerId: string, row: OpportunitySeed) {
  const expectedCloseDate = addMonths(new Date(), row.monthsFromNow);
  expectedCloseDate.setDate(1);

  await prisma.opportunity.upsert({
    where: { id: row.id },
    update: {
      title: row.title,
      expectedAmount: row.amount,
      stage: row.stage,
      status: row.status,
      ownerId,
    },
    create: {
      id: row.id,
      title: row.title,
      customerId: row.customerId,
      ownerId,
      expectedAmount: row.amount,
      expectedCloseDate,
      stage: row.stage,
      status: row.status,
      amountLocked: row.status === "SIGNED",
      requirementDesc: "演示数据：用于测试商机列表与跟进。",
    },
  });
}

async function upsertContract(
  ownerId: string,
  salesManagerId: string,
  productId: string,
  row: ContractSeed
) {
  const signedAt = row.signedDaysAgo != null ? daysAgo(row.signedDaysAgo) : null;
  const isSigned = row.status === "SIGNED_PENDING_IMPL";
  const isPending = row.status === "PENDING_APPROVAL";
  const isRejected = row.status === "REJECTED";

  const contractNo = isSigned
    ? `HT-${signedAt!.toISOString().slice(0, 10).replace(/-/g, "")}-DEMO`
    : null;

  await prisma.contract.upsert({
    where: { id: row.id },
    update: {
      title: row.title,
      totalAmount: row.amount,
      status: row.status,
      ownerId,
      signContactId: row.contactId,
      ourRepresentativeId: ownerId,
      signedAt,
      contractNo: isSigned ? contractNo : null,
      rejectReason: row.rejectReason ?? null,
      rejectedAt: isRejected ? daysAgo(5) : null,
      submittedAt: signedAt ?? new Date(),
      submittedById: ownerId,
      approvedAt: isSigned ? signedAt : null,
      approvedById: isSigned ? salesManagerId : null,
    },
    create: {
      id: row.id,
      title: row.title,
      totalAmount: row.amount,
      signingType: SigningType.DIRECT,
      status: row.status,
      signCustomerId: row.customerId,
      endUserCustomerId: row.customerId,
      signContactId: row.contactId,
      ourRepresentativeId: ownerId,
      paymentMethod: "BANK_TRANSFER",
      ownerId,
      opportunityId: row.opportunityId,
      signedAt,
      contractNo,
      notes: "演示合同数据",
      submittedAt: signedAt ?? new Date(),
      submittedById: ownerId,
      approvedAt: isSigned ? signedAt : null,
      approvedById: isSigned ? salesManagerId : null,
      rejectedAt: isRejected ? daysAgo(5) : null,
      rejectReason: row.rejectReason,
    },
  });

  // 产品行
  await prisma.contractProduct.deleteMany({ where: { contractId: row.id } });
  await prisma.contractProduct.create({
    data: {
      id: `${row.id}-product`,
      contractId: row.id,
      productServiceId: productId,
      productName: "实施服务",
      costAmount: row.amount * 0.35,
      actualCostPrice: row.amount * 0.35,
      baselineCostPrice: row.amount * 0.35,
      salesAmount: 0,
    },
  });

  // 回款计划：3 期均分
  await prisma.paymentInstallment.deleteMany({ where: { contractId: row.id } });
  const perInstallment = Math.round((row.amount / 3) * 100) / 100;
  const lastInstallment = row.amount - perInstallment * 2;
  for (let i = 1; i <= 3; i++) {
    await prisma.paymentInstallment.create({
      data: {
        id: `${row.id}-inst-${i}`,
        contractId: row.id,
        periodNumber: i,
        amount: i === 3 ? lastInstallment : perInstallment,
        condition: i === 1 ? "合同签订后" : i === 2 ? "系统上线后" : "验收合格后",
        dueAt: addMonths(signedAt ?? new Date(), i * 2),
      },
    });
  }

  // 已签署：创建项目 + 回款记录
  if (isSigned && signedAt) {
    await prisma.project.upsert({
      where: { contractId: row.id },
      update: { name: row.title, customerId: row.customerId },
      create: {
        id: `${row.id}-project`,
        name: row.title,
        contractId: row.id,
        customerId: row.customerId,
        status: "PENDING_START",
      },
    });

    if (row.opportunityId) {
      await prisma.opportunity.update({
        where: { id: row.opportunityId },
        data: { status: "SIGNED", amountLocked: true },
      });
    }

    await prisma.contractPaymentRecord.deleteMany({ where: { contractId: row.id } });
    if (row.paidAmount && row.paidAmount > 0) {
      await prisma.contractPaymentRecord.create({
        data: {
          id: `${row.id}-payment`,
          contractId: row.id,
          amount: row.paidAmount,
          paidAt: daysAgo(Math.max(1, (row.signedDaysAgo ?? 30) - 7)),
          notes: "演示回款（一次性登记，瀑布展示第一期 100% + 第二期部分）",
          recordedById: ownerId,
        },
      });
    }
  } else if (isPending || isRejected) {
    // 待审核/驳回不应有项目
    const existingProject = await prisma.project.findUnique({ where: { contractId: row.id } });
    if (existingProject) {
      await prisma.project.delete({ where: { id: existingProject.id } });
    }
    await prisma.contractPaymentRecord.deleteMany({ where: { contractId: row.id } });
  }
}

async function migrateLegacySalesDemoData(sales1Id: string) {
  const legacy = await prisma.user.findUnique({ where: { email: LEGACY_SALES_EMAIL } });
  if (!legacy || legacy.id === sales1Id) return;

  await prisma.customer.updateMany({
    where: { id: { startsWith: "demo-" }, ownerId: legacy.id },
    data: { ownerId: sales1Id },
  });
  await prisma.opportunity.updateMany({
    where: { id: { startsWith: "demo-" }, ownerId: legacy.id },
    data: { ownerId: sales1Id },
  });
  await prisma.contract.updateMany({
    where: { id: { startsWith: "demo-" }, ownerId: legacy.id },
    data: { ownerId: sales1Id, ourRepresentativeId: sales1Id, submittedById: sales1Id },
  });
}

async function main() {
  const product = await prisma.productServiceTemplate.findFirst({
    where: { enabled: true },
    orderBy: { name: "asc" },
  });
  if (!product) {
    throw new Error("请先运行 npm run db:seed 创建产品模板");
  }

  const { users, managerId } = await ensureSalesUsers();
  await migrateLegacySalesDemoData(users.zhang);

  for (const rep of SALES_REPS) {
    const ownerId = users[rep.prefix];
    if (!ownerId) continue;

    const bundle = DEMO_BY_SALES[rep.prefix];
    for (const customer of bundle.customers) {
      await upsertCustomer(ownerId, customer);
    }
    for (const opp of bundle.opportunities) {
      await upsertOpportunity(ownerId, opp);
    }
    for (const contract of bundle.contracts) {
      await upsertContract(ownerId, managerId, product.id, contract);
    }
  }

  console.log("\n演示数据已就绪：\n");
  console.log("  销售账号（密码均为 sales123）：");
  for (const rep of SALES_REPS) {
    console.log(`    ${rep.email}  ${rep.name}`);
  }
  if (await prisma.user.findUnique({ where: { email: LEGACY_SALES_EMAIL } })) {
    console.log(`    ${LEGACY_SALES_EMAIL}  张销售（旧账号，演示数据在 sales1@）`);
  }
  console.log("\n  每位销售：2 个客户、2 个商机、1–2 份合同");
  console.log("  张销售：待审核 + 已签署（75 万回款 / 150 万合同）");
  console.log("  李销售：已签署（150 万回款 / 220 万合同）+ 已驳回样例");
  console.log("  王销售：待审核合同");
  console.log("\n  销售管理审核：salesmgr@example.com / sales123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
