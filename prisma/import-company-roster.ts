/**
 * 按公司企微人员清单重置：
 * - 清除客户 / 商机 / 日志 / 合同及相关业务数据（项目一并清空，避免孤儿数据）
 * - 清除全部用户后按清单重建（企微 UserID + 角色，待激活）
 * - 按姓名匹配，保留原人员成本档案与月度调整
 *
 * 用法：npx tsx prisma/import-company-roster.ts
 */
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  UserRole,
  StaffCategory,
  PersonnelType,
  Prisma,
} from "@prisma/client";
import { staffCategoryForRole } from "../src/lib/wecom/access-request";

const prisma = new PrismaClient();

type RosterRow = {
  name: string;
  wecomUserId: string;
  role: UserRole;
};

/** 上传清单：姓名 / 企微账号 / 角色 */
const ROSTER: RosterRow[] = [
  { name: "张潇笑", wecomUserId: "xxZhang", role: UserRole.ADMIN },
  { name: "毛海斌", wecomUserId: "hbMao", role: UserRole.PROJECT_MANAGER },
  { name: "万嘉南", wecomUserId: "jnWan", role: UserRole.ADMIN },
  { name: "蔡泽能", wecomUserId: "znCai", role: UserRole.PROJECT_MANAGER },
  { name: "纪超", wecomUserId: "cJi", role: UserRole.PROJECT_STAFF },
  { name: "王玉成", wecomUserId: "ycWang", role: UserRole.PROJECT_ADMIN },
  { name: "侯海峰", wecomUserId: "hfHou", role: UserRole.PROJECT_STAFF },
  { name: "贾超群", wecomUserId: "cqJia", role: UserRole.PROJECT_STAFF },
  { name: "林贤庆", wecomUserId: "xqLin", role: UserRole.PROJECT_STAFF },
  { name: "刘晋江", wecomUserId: "jjLiu", role: UserRole.PROJECT_STAFF },
  { name: "刘武全", wecomUserId: "wqLiu", role: UserRole.PROJECT_STAFF },
  { name: "田玉杰", wecomUserId: "yjTian", role: UserRole.PROJECT_STAFF },
  { name: "徐鸽", wecomUserId: "gXu", role: UserRole.PROJECT_STAFF },
  { name: "郁志翔", wecomUserId: "zxYu", role: UserRole.PROJECT_STAFF },
  { name: "周有武", wecomUserId: "ywZhou", role: UserRole.PROJECT_STAFF },
  { name: "蔡晗蕾", wecomUserId: "hlCai", role: UserRole.SALES_MANAGER },
  { name: "钱金明", wecomUserId: "jmQian", role: UserRole.SALES },
  { name: "沈伟", wecomUserId: "wShen", role: UserRole.SALES },
  { name: "钱佳莹", wecomUserId: "jyQian", role: UserRole.HR },
];

/** 管理员临时账密，便于清库后仍可登录（可随后改为企微激活） */
const ADMIN_BOOTSTRAP: Record<string, { phone: string; password: string }> = {
  xxZhang: { phone: "13900000001", password: "admin123" },
  jnWan: { phone: "13900000002", password: "admin123" },
};

type CostSnapshot = {
  contributionBase: Prisma.Decimal | null;
  baseSalary: Prisma.Decimal | null;
  socialSecurityCompany: Prisma.Decimal | null;
  housingFundCompany: Prisma.Decimal | null;
  dailyRate: Prisma.Decimal | null;
  isPresales: boolean;
  personnelType: PersonnelType | null;
  months: Array<{
    year: number;
    month: number;
    contributionBase: Prisma.Decimal | null;
    baseSalary: Prisma.Decimal | null;
    socialSecurityCompany: Prisma.Decimal | null;
    housingFundCompany: Prisma.Decimal | null;
    adjustmentAmount: Prisma.Decimal;
    notes: string | null;
  }>;
};

function personnelTypeForRole(role: UserRole): PersonnelType | null {
  if (role === UserRole.PROJECT_MANAGER || role === UserRole.PROJECT_ADMIN) {
    return PersonnelType.PROJECT_MANAGER;
  }
  if (role === UserRole.PROJECT_STAFF) {
    return PersonnelType.IMPLEMENTER;
  }
  return null;
}

async function snapshotCostsByName(): Promise<Map<string, CostSnapshot>> {
  const users = await prisma.user.findMany({
    include: {
      personnelProfile: true,
      monthlyCostAdjustments: true,
    },
  });

  const map = new Map<string, CostSnapshot>();
  for (const u of users) {
    const p = u.personnelProfile;
    if (!p) continue;
    const hasCost =
      p.contributionBase != null ||
      p.baseSalary != null ||
      p.socialSecurityCompany != null ||
      p.housingFundCompany != null ||
      p.dailyRate != null ||
      u.monthlyCostAdjustments.length > 0;
    if (!hasCost) continue;

    // 同名取有成本数据的一条（清单内姓名唯一）
    map.set(u.name.trim(), {
      contributionBase: p.contributionBase,
      baseSalary: p.baseSalary,
      socialSecurityCompany: p.socialSecurityCompany,
      housingFundCompany: p.housingFundCompany,
      dailyRate: p.dailyRate,
      isPresales: p.isPresales,
      personnelType: p.personnelType,
      months: u.monthlyCostAdjustments.map((m) => ({
        year: m.year,
        month: m.month,
        contributionBase: m.contributionBase,
        baseSalary: m.baseSalary,
        socialSecurityCompany: m.socialSecurityCompany,
        housingFundCompany: m.housingFundCompany,
        adjustmentAmount: m.adjustmentAmount,
        notes: m.notes,
      })),
    });
  }
  return map;
}

async function wipeBusinessData() {
  // 销售日志 / 计划任务
  await prisma.salesCheckIn.deleteMany();
  await prisma.salesDailyLog.deleteMany();
  await prisma.salesPlanItem.deleteMany();
  await prisma.salesPlanBoard.deleteMany();
  await prisma.salesWeeklyAssignment.deleteMany();
  await prisma.salesTask.deleteMany();
  await prisma.salesMonthlyTarget.deleteMany();
  await prisma.salesTarget.deleteMany();
  await prisma.salesCost.deleteMany();

  // 商机
  await prisma.opportunityFollowUp.deleteMany();
  await prisma.opportunityStageLog.deleteMany();
  await prisma.opportunity.deleteMany();

  // 项目（依赖客户/合同）
  await prisma.projectStaffAllocation.deleteMany();
  await prisma.projectCost.deleteMany();
  await prisma.projectTask.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectPhase.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.presalesAssignment.deleteMany();
  await prisma.project.deleteMany();

  // 合同
  await prisma.contractPaymentRecord.deleteMany();
  await prisma.paymentInstallment.deleteMany();
  await prisma.contractProduct.deleteMany();
  await prisma.contractAttachment.deleteMany();
  await prisma.contract.deleteMany();

  // 客户
  await prisma.followUpContact.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.customerAssistant.deleteMany();
  await prisma.customerClaimRequest.deleteMany();
  await prisma.customerRelation.deleteMany();
  await prisma.customerTag.deleteMany();
  await prisma.customer.deleteMany();

  // 企微开通申请
  await prisma.weComAccessRequest.deleteMany();
}

async function wipeUsers() {
  await prisma.personnelMonthlyCostAdjustment.deleteMany();
  await prisma.personnelProfile.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log("→ 快照现有人员成本（按姓名）…");
  const costByName = await snapshotCostsByName();
  console.log(`  匹配到 ${costByName.size} 人有成本数据可保留`);

  console.log("→ 清除客户 / 商机 / 日志 / 合同 / 项目等业务数据…");
  await wipeBusinessData();

  console.log("→ 清除全部用户…");
  await wipeUsers();

  console.log(`→ 按清单导入 ${ROSTER.length} 人…`);
  let costRestored = 0;

  for (const row of ROSTER) {
    const staffCategory = staffCategoryForRole(row.role);
    const defaultType = personnelTypeForRole(row.role);
    const snap = costByName.get(row.name.trim());
    const bootstrap = ADMIN_BOOTSTRAP[row.wecomUserId];

    const passwordHash = bootstrap
      ? await bcrypt.hash(bootstrap.password, 10)
      : null;

    const profileCreate: Prisma.PersonnelProfileCreateWithoutUserInput = {
      staffCategory,
      personnelType: snap?.personnelType ?? defaultType,
      isPresales: snap?.isPresales ?? false,
      contributionBase: snap?.contributionBase ?? null,
      baseSalary: snap?.baseSalary ?? null,
      socialSecurityCompany: snap?.socialSecurityCompany ?? null,
      housingFundCompany: snap?.housingFundCompany ?? null,
      dailyRate: snap?.dailyRate ?? null,
      enabled: true,
    };

    if (staffCategory !== StaffCategory.IMPLEMENTATION) {
      // 非实施侧不强制 personnelType
      if (!snap) {
        profileCreate.personnelType = null;
        profileCreate.isPresales = false;
      }
    }

    const user = await prisma.user.create({
      data: {
        name: row.name,
        wecomUserId: row.wecomUserId,
        role: row.role,
        phone: bootstrap?.phone ?? null,
        passwordHash,
        email: null,
        personnelProfile: { create: profileCreate },
      },
    });

    if (snap?.months.length) {
      await prisma.personnelMonthlyCostAdjustment.createMany({
        data: snap.months.map((m) => ({
          userId: user.id,
          year: m.year,
          month: m.month,
          contributionBase: m.contributionBase,
          baseSalary: m.baseSalary,
          socialSecurityCompany: m.socialSecurityCompany,
          housingFundCompany: m.housingFundCompany,
          adjustmentAmount: m.adjustmentAmount,
          notes: m.notes,
        })),
      });
    }

    if (snap) {
      costRestored += 1;
      console.log(`  ✓ ${row.name}（${row.wecomUserId}）·${row.role} · 已保留成本`);
    } else {
      console.log(`  ✓ ${row.name}（${row.wecomUserId}）·${row.role}`);
    }
  }

  console.log(`\n完成：导入 ${ROSTER.length} 人，其中 ${costRestored} 人保留了原人员成本。`);
  console.log("管理员临时登录（待企微激活后可改）：");
  console.log("  张潇笑 13900000001 / admin123");
  console.log("  万嘉南 13900000002 / admin123");
  console.log("其余账号为待激活：企微扫码后设置手机号与密码即可。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
