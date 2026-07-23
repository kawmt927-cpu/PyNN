/**
 * 清空当前库全部业务数据与用户，再按 JSON 导入人员（以本地导出为准）。
 * 保留：系统配置 / 项目模型模板 / AI·高德配置等非人员业务底座（若存在）。
 *
 * 用法：npx tsx prisma/reset-and-upsert-roster.ts [json路径]
 */
import { readFile } from "fs/promises";
import path from "path";
import {
  PrismaClient,
  UserRole,
  StaffCategory,
  PersonnelType,
  Prisma,
} from "@prisma/client";

const prisma = new PrismaClient();

function staffCategoryForRole(role: UserRole): StaffCategory {
  if (
    role === UserRole.SALES ||
    role === UserRole.SALES_MANAGER ||
    role === UserRole.ADMIN ||
    role === UserRole.HR
  ) {
    return StaffCategory.SALES;
  }
  return StaffCategory.IMPLEMENTATION;
}

type ExportProfile = {
  staffCategory: StaffCategory;
  personnelType: PersonnelType | null;
  isPresales: boolean;
  contributionBase: string | null;
  baseSalary: string | null;
  socialSecurityCompany: string | null;
  housingFundCompany: string | null;
  dailyRate: string | null;
  enabled: boolean;
};

type ExportUser = {
  name: string;
  email: string | null;
  phone: string | null;
  wecomUserId: string | null;
  role: UserRole;
  passwordHash: string | null;
  personnelProfile: ExportProfile | null;
  monthlyCostAdjustments: Array<{
    year: number;
    month: number;
    contributionBase: string | null;
    baseSalary: string | null;
    socialSecurityCompany: string | null;
    housingFundCompany: string | null;
    adjustmentAmount: string;
    notes: string | null;
  }>;
};

type ExportFile = {
  exportedAt: string;
  count: number;
  users: ExportUser[];
};

function dec(v: string | null | undefined): Prisma.Decimal | null {
  if (v == null || v === "") return null;
  return new Prisma.Decimal(v);
}

async function wipeAllBusinessAndUsers() {
  console.log("→ 清除业务数据…");
  await prisma.salesCheckIn.deleteMany();
  await prisma.salesDailyLog.deleteMany();
  await prisma.salesPlanItem.deleteMany();
  await prisma.salesPlanBoard.deleteMany();
  await prisma.salesWeeklyAssignment.deleteMany();
  await prisma.salesTask.deleteMany();
  await prisma.salesMonthlyTarget.deleteMany();
  await prisma.salesTarget.deleteMany();
  await prisma.salesCost.deleteMany();

  await prisma.opportunityFollowUp.deleteMany();
  await prisma.opportunityStageLog.deleteMany();
  await prisma.opportunity.deleteMany();

  await prisma.projectStaffAllocation.deleteMany();
  await prisma.projectCost.deleteMany();
  await prisma.projectTask.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectPhase.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.presalesAssignment.deleteMany();
  await prisma.project.deleteMany();

  await prisma.contractPaymentRecord.deleteMany();
  await prisma.paymentInstallment.deleteMany();
  await prisma.contractProduct.deleteMany();
  await prisma.contractAttachment.deleteMany();
  await prisma.contract.deleteMany();

  await prisma.followUpContact.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.customerAssistant.deleteMany();
  await prisma.customerClaimRequest.deleteMany();
  await prisma.customerRelation.deleteMany();
  await prisma.customerTag.deleteMany();
  await prisma.customer.deleteMany();

  await prisma.weComAccessRequest.deleteMany();

  console.log("→ 清除全部用户…");
  // 解除配置表对 User 的 updater 引用（若有）
  try {
    await prisma.aiAgentConfig.updateMany({ data: { updatedById: null } });
  } catch {
    /* ignore */
  }
  try {
    await prisma.amapConfig.updateMany({ data: { updatedById: null } });
  } catch {
    /* ignore */
  }

  await prisma.personnelMonthlyCostAdjustment.deleteMany();
  await prisma.personnelProfile.deleteMany();
  await prisma.user.deleteMany();
}

async function importUsers(users: ExportUser[]) {
  console.log(`→ 导入 ${users.length} 人…`);
  for (const row of users) {
    const wecomUserId = row.wecomUserId?.trim();
    if (!wecomUserId) {
      console.warn(`  跳过（无企微 ID）：${row.name}`);
      continue;
    }

    const profile = row.personnelProfile;
    const staffCategory = profile?.staffCategory ?? staffCategoryForRole(row.role);
    const profileData = {
      staffCategory,
      personnelType: profile?.personnelType ?? null,
      isPresales: profile?.isPresales ?? false,
      contributionBase: dec(profile?.contributionBase),
      baseSalary: dec(profile?.baseSalary),
      socialSecurityCompany: dec(profile?.socialSecurityCompany),
      housingFundCompany: dec(profile?.housingFundCompany),
      dailyRate: dec(profile?.dailyRate),
      enabled: profile?.enabled ?? true,
    };

    const user = await prisma.user.create({
      data: {
        name: row.name,
        wecomUserId,
        role: row.role,
        email: row.email,
        phone: row.phone,
        passwordHash: row.passwordHash,
        personnelProfile: { create: profileData },
      },
    });

    if (row.monthlyCostAdjustments?.length) {
      await prisma.personnelMonthlyCostAdjustment.createMany({
        data: row.monthlyCostAdjustments.map((m) => ({
          userId: user.id,
          year: m.year,
          month: m.month,
          contributionBase: dec(m.contributionBase),
          baseSalary: dec(m.baseSalary),
          socialSecurityCompany: dec(m.socialSecurityCompany),
          housingFundCompany: dec(m.housingFundCompany),
          adjustmentAmount: new Prisma.Decimal(m.adjustmentAmount || "0"),
          notes: m.notes,
        })),
      });
    }

    console.log(`  ✓ ${row.name}（${wecomUserId}）·${row.role}`);
  }
}

async function main() {
  const jsonPath = path.resolve(
    process.argv[2] ?? path.join(process.cwd(), "tmp", "roster-sync.json")
  );
  const raw = await readFile(jsonPath, "utf8");
  const data = JSON.parse(raw) as ExportFile;
  if (!Array.isArray(data.users) || data.users.length === 0) {
    throw new Error("JSON 无效或 users 为空");
  }

  console.log(`来源：${jsonPath}（导出于 ${data.exportedAt}，${data.users.length} 人）`);
  console.log("⚠ 将清空当前库全部业务数据与用户，再导入人员。");

  await wipeAllBusinessAndUsers();
  await importUsers(data.users);

  const [users, customers, contracts, projects] = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.contract.count(),
    prisma.project.count(),
  ]);
  console.log("\n完成校验：");
  console.log(`  用户 ${users} · 客户 ${customers} · 合同 ${contracts} · 项目 ${projects}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
