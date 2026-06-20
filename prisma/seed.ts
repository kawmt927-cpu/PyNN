import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, StaffCategory, PersonnelType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "系统管理员",
      passwordHash,
      role: UserRole.ADMIN,
      personnelProfile: {
        create: {
          staffCategory: StaffCategory.SALES,
          personnelType: PersonnelType.PROJECT_MANAGER,
          enabled: true,
        },
      },
    },
  });

  const salesManager = await prisma.user.upsert({
    where: { email: "salesmgr@example.com" },
    update: {},
    create: {
      email: "salesmgr@example.com",
      name: "销售经理",
      passwordHash: await bcrypt.hash("sales123", 10),
      role: UserRole.SALES_MANAGER,
      personnelProfile: {
        create: { staffCategory: StaffCategory.SALES, enabled: true },
      },
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: "sales@example.com" },
    update: {},
    create: {
      email: "sales@example.com",
      name: "张销售",
      passwordHash: await bcrypt.hash("sales123", 10),
      role: UserRole.SALES,
      personnelProfile: {
        create: { staffCategory: StaffCategory.SALES, enabled: true },
      },
    },
  });

  await prisma.user.upsert({
    where: { email: "projadmin@example.com" },
    update: {},
    create: {
      email: "projadmin@example.com",
      name: "李项目管理员",
      passwordHash: await bcrypt.hash("proj123", 10),
      role: UserRole.PROJECT_ADMIN,
      personnelProfile: {
        create: {
          staffCategory: StaffCategory.IMPLEMENTATION,
          personnelType: PersonnelType.PROJECT_MANAGER,
          isPresales: true,
          dailyRate: 1500,
          enabled: true,
        },
      },
    },
  });

  await prisma.user.upsert({
    where: { email: "pm@example.com" },
    update: {},
    create: {
      email: "pm@example.com",
      name: "王项目经理",
      passwordHash: await bcrypt.hash("proj123", 10),
      role: UserRole.PROJECT_MANAGER,
      personnelProfile: {
        create: {
          staffCategory: StaffCategory.IMPLEMENTATION,
          personnelType: PersonnelType.PROJECT_MANAGER,
          enabled: true,
        },
      },
    },
  });

  await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: {},
    create: {
      email: "staff@example.com",
      name: "赵实施",
      passwordHash: await bcrypt.hash("proj123", 10),
      role: UserRole.PROJECT_STAFF,
      personnelProfile: {
        create: {
          staffCategory: StaffCategory.IMPLEMENTATION,
          personnelType: PersonnelType.IMPLEMENTER,
          enabled: true,
        },
      },
    },
  });

  await prisma.customer.upsert({
    where: { id: "seed-customer-pool" },
    update: {},
    create: {
      id: "seed-customer-pool",
      name: "示例公海客户-某市第一人民医院",
      category: "HOSPITAL",
      hospitalLevel: "GRADE_3A",
      province: "广东省",
      city: "深圳市",
      source: "ACTIVE_DEV",
      customerType: "DIRECT",
      customerGrade: "STAR_2",
      ownerId: null,
    },
  });

  await prisma.productServiceTemplate.upsert({
    where: { id: "seed-product-impl" },
    update: {},
    create: {
      id: "seed-product-impl",
      name: "实施服务",
      description: "标准软件实施服务",
      baselineCostPrice: 50000,
      phaseTemplates: {
        create: [
          { name: "项目启动", sortOrder: 1 },
          { name: "需求调研", sortOrder: 2 },
          { name: "系统部署", sortOrder: 3, parallelGroup: 1 },
          { name: "数据迁移", sortOrder: 3, parallelGroup: 1 },
          { name: "用户培训", sortOrder: 4 },
          { name: "项目验收", sortOrder: 5 },
        ],
      },
    },
  });

  const configOptions = [
    { category: "follow_up_method", value: "PHONE", label: "电话" },
    { category: "follow_up_method", value: "WECHAT", label: "微信" },
    { category: "follow_up_method", value: "FACE_VISIT", label: "面访" },
    { category: "follow_up_method", value: "ONLINE_MEETING", label: "线上会议" },
    { category: "follow_up_result", value: "PROGRESS", label: "有意向推进" },
    { category: "follow_up_result", value: "NO_PROGRESS", label: "无进展" },
    { category: "follow_up_result", value: "RESCHEDULE", label: "需再约" },
    { category: "follow_up_result", value: "NO_INTEREST", label: "暂无意向" },
    { category: "customer_source", value: "ACTIVE_DEV", label: "主动开发", sortOrder: 1 },
    { category: "customer_source", value: "COMPANY_ASSIGN", label: "公司分配", sortOrder: 2 },
    { category: "customer_source", value: "CHANNEL_INTRO", label: "渠道介绍", sortOrder: 3 },
    { category: "customer_source", value: "LEAD_CONVERT", label: "线索转化", sortOrder: 4 },
    { category: "customer_type", value: "DIRECT", label: "直接客户", sortOrder: 1 },
    { category: "customer_type", value: "CHANNEL", label: "渠道", sortOrder: 2 },
    { category: "customer_type", value: "PARTNER", label: "合作伙伴", sortOrder: 3 },
    { category: "customer_grade", value: "STAR_3", label: "三星", sortOrder: 1 },
    { category: "customer_grade", value: "STAR_2", label: "两星", sortOrder: 2 },
    { category: "customer_grade", value: "STAR_1", label: "一星", sortOrder: 3 },
    { category: "customer_grade", value: "NONE", label: "未评级", sortOrder: 4 },
    { category: "customer_tag", value: "TAG_KEY_ACCOUNT", label: "重点客户", sortOrder: 1, color: "#bae6fd" },
    { category: "customer_tag", value: "TAG_STRATEGIC", label: "战略客户", sortOrder: 2, color: "#ddd6fe" },
    { category: "customer_tag", value: "TAG_RISK", label: "风险关注", sortOrder: 3, color: "#fecdd3" },
    { category: "opportunity_stage", value: "INITIAL_VISIT", label: "初访", sortOrder: 1 },
    { category: "opportunity_stage", value: "NEEDS_CONFIRM", label: "需求确认", sortOrder: 2 },
    { category: "opportunity_stage", value: "PROPOSAL", label: "方案", sortOrder: 3 },
    { category: "opportunity_stage", value: "QUOTATION", label: "报价", sortOrder: 4 },
    { category: "opportunity_stage", value: "NEGOTIATION", label: "谈判", sortOrder: 5 },
    { category: "project_cost_category", value: "TRAVEL", label: "差旅费", sortOrder: 1 },
    { category: "project_cost_category", value: "LABOR", label: "人力成本", sortOrder: 2 },
    { category: "project_cost_category", value: "PURCHASE", label: "采购费用", sortOrder: 3 },
    { category: "project_cost_category", value: "OTHER", label: "其他", sortOrder: 4 },
  ];

  for (const opt of configOptions) {
    await prisma.configOption.upsert({
      where: { category_value: { category: opt.category, value: opt.value } },
      update: {},
      create: opt,
    });
  }

  console.log("Seed completed:");
  console.log("  Admin: admin@example.com / admin123");
  console.log("  Sales Manager: salesmgr@example.com / sales123");
  console.log("  Sales: sales@example.com / sales123");
  console.log("  Project Admin: projadmin@example.com / proj123");
  console.log("  Project Manager: pm@example.com / proj123");
  console.log("  Project Staff: staff@example.com / proj123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
