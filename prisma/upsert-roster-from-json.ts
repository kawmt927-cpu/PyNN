/**
 * 按 JSON 清单 upsert 人员到当前 DATABASE_URL（不清客户/合同等业务数据）。
 * 匹配键：真实企微 ID → 姓名；无匹配则新建。
 *
 * 用法：npx tsx prisma/upsert-roster-from-json.ts [json路径]
 * 默认：tmp/roster-sync.json
 *
 * 可选：--prune-demo 删除仍带 @example.com 且不在本次清单中的演示账号
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

function isSyntheticWecom(id: string | null | undefined): boolean {
  if (!id) return true;
  return id.startsWith("payroll-import-") || id.startsWith("import-");
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

type ExportMonth = {
  year: number;
  month: number;
  contributionBase: string | null;
  baseSalary: string | null;
  socialSecurityCompany: string | null;
  housingFundCompany: string | null;
  adjustmentAmount: string;
  leaveDeductionAmount?: string;
  attendanceDays?: number | null;
  payrollEntity?: string | null;
  seniorityYears?: string | null;
  bonus?: string | null;
  performancePay?: string | null;
  wageAdjust?: string | null;
  sickLeaveDays?: string | null;
  sickLeaveDeduction?: string | null;
  personalLeaveDays?: string | null;
  personalLeaveDeduction?: string | null;
  payableWage?: string | null;
  pensionPersonal?: string | null;
  medicalPersonal?: string | null;
  unemploymentPersonal?: string | null;
  socialSecurityPersonal?: string | null;
  housingFundPersonal?: string | null;
  incomeTax?: string | null;
  netPay?: string | null;
  notes: string | null;
  confirmedAt?: string | null;
};

type ExportUser = {
  name: string;
  email: string | null;
  phone: string | null;
  wecomUserId: string | null;
  role: UserRole;
  passwordHash: string | null;
  includeInTeamPerformance?: boolean;
  includeInMonthlyAssessment?: boolean;
  personnelProfile: ExportProfile | null;
  monthlyCostAdjustments: ExportMonth[];
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

function monthPayload(m: ExportMonth) {
  return {
    contributionBase: dec(m.contributionBase),
    baseSalary: dec(m.baseSalary),
    socialSecurityCompany: dec(m.socialSecurityCompany),
    housingFundCompany: dec(m.housingFundCompany),
    adjustmentAmount: new Prisma.Decimal(m.adjustmentAmount || "0"),
    leaveDeductionAmount: new Prisma.Decimal(m.leaveDeductionAmount || "0"),
    attendanceDays: m.attendanceDays ?? null,
    payrollEntity: m.payrollEntity ?? null,
    seniorityYears: dec(m.seniorityYears),
    bonus: dec(m.bonus),
    performancePay: dec(m.performancePay),
    wageAdjust: dec(m.wageAdjust),
    sickLeaveDays: dec(m.sickLeaveDays),
    sickLeaveDeduction: dec(m.sickLeaveDeduction),
    personalLeaveDays: dec(m.personalLeaveDays),
    personalLeaveDeduction: dec(m.personalLeaveDeduction),
    payableWage: dec(m.payableWage),
    pensionPersonal: dec(m.pensionPersonal),
    medicalPersonal: dec(m.medicalPersonal),
    unemploymentPersonal: dec(m.unemploymentPersonal),
    socialSecurityPersonal: dec(m.socialSecurityPersonal),
    housingFundPersonal: dec(m.housingFundPersonal),
    incomeTax: dec(m.incomeTax),
    netPay: dec(m.netPay),
    notes: m.notes,
    confirmedAt: m.confirmedAt ? new Date(m.confirmedAt) : null,
  };
}

async function findExistingUser(row: ExportUser) {
  const wecomUserId = row.wecomUserId?.trim() || null;
  if (wecomUserId && !isSyntheticWecom(wecomUserId)) {
    const byWecom = await prisma.user.findUnique({ where: { wecomUserId } });
    if (byWecom) return byWecom;
  }
  const byName = await prisma.user.findFirst({ where: { name: row.name } });
  if (byName) return byName;
  if (wecomUserId) {
    return prisma.user.findUnique({ where: { wecomUserId } });
  }
  return null;
}

async function upsertOne(row: ExportUser) {
  const wecomUserId = row.wecomUserId?.trim() || null;
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

  const includeFlags = {
    includeInTeamPerformance:
      row.includeInTeamPerformance ?? (row.role !== "OTHER"),
    includeInMonthlyAssessment:
      row.includeInMonthlyAssessment ?? (row.role !== "OTHER"),
  };

  const existing = await findExistingUser(row);
  let userId: string;

  if (existing) {
    const data: Prisma.UserUpdateInput = {
      name: row.name,
      role: row.role,
      email: row.email,
      phone: row.phone,
      passwordHash: row.passwordHash,
      ...includeFlags,
    };
    // 仅当目标库尚无真实企微、且导出带真实企微时写入
    if (
      wecomUserId &&
      !isSyntheticWecom(wecomUserId) &&
      (!existing.wecomUserId || isSyntheticWecom(existing.wecomUserId))
    ) {
      data.wecomUserId = wecomUserId;
    } else if (
      wecomUserId &&
      isSyntheticWecom(wecomUserId) &&
      !existing.wecomUserId
    ) {
      data.wecomUserId = wecomUserId;
    }

    await prisma.user.update({ where: { id: existing.id }, data });
    userId = existing.id;

    const hasProfile = await prisma.personnelProfile.findUnique({
      where: { userId },
    });
    if (hasProfile) {
      await prisma.personnelProfile.update({
        where: { userId },
        data: profileData,
      });
    } else {
      await prisma.personnelProfile.create({
        data: { userId, ...profileData },
      });
    }
    console.log(`  ↑ 更新 ${row.name}（${existing.wecomUserId ?? "无企微"}）·${row.role}`);
  } else {
    if (!wecomUserId && !row.phone) {
      console.warn(`  跳过（无企微且无手机号）：${row.name}`);
      return;
    }
    if (row.phone) {
      const phoneTaken = await prisma.user.findUnique({ where: { phone: row.phone } });
      if (phoneTaken) {
        throw new Error(`手机号 ${row.phone} 已被 ${phoneTaken.name} 占用，无法导入 ${row.name}`);
      }
    }

    const created = await prisma.user.create({
      data: {
        name: row.name,
        wecomUserId,
        role: row.role,
        email: row.email,
        phone: row.phone,
        passwordHash: row.passwordHash,
        ...includeFlags,
        personnelProfile: { create: profileData },
      },
    });
    userId = created.id;
    console.log(`  + 新建 ${row.name}（${wecomUserId ?? "无企微"}）·${row.role}`);
  }

  if (row.monthlyCostAdjustments?.length) {
    for (const m of row.monthlyCostAdjustments) {
      const payload = monthPayload(m);
      await prisma.personnelMonthlyCostAdjustment.upsert({
        where: {
          userId_year_month: { userId, year: m.year, month: m.month },
        },
        create: {
          userId,
          year: m.year,
          month: m.month,
          ...payload,
        },
        update: payload,
      });
    }
  }
}

async function pruneDemoUsers(keepNames: Set<string>, keepWecomIds: Set<string>) {
  const demos = await prisma.user.findMany({
    where: {
      email: { endsWith: "@example.com" },
    },
    select: { id: true, name: true, email: true, wecomUserId: true },
  });

  for (const u of demos) {
    if (keepNames.has(u.name)) continue;
    if (u.wecomUserId && keepWecomIds.has(u.wecomUserId)) continue;
    try {
      await prisma.personnelMonthlyCostAdjustment.deleteMany({ where: { userId: u.id } });
      await prisma.personnelProfile.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
      console.log(`  − 删除演示账号 ${u.name}（${u.email}）`);
    } catch (e) {
      console.warn(`  ! 无法删除 ${u.name}（可能仍有业务数据关联）：`, e);
    }
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const pruneDemo = process.argv.includes("--prune-demo");
  const jsonPath = path.resolve(args[0] ?? path.join(process.cwd(), "tmp", "roster-sync.json"));

  const raw = await readFile(jsonPath, "utf8");
  const data = JSON.parse(raw) as ExportFile;
  if (!Array.isArray(data.users)) throw new Error("JSON 格式无效：缺少 users");

  console.log(`→ 从 ${jsonPath} 同步 ${data.users.length} 人（导出于 ${data.exportedAt}）…`);

  const keepWecom = new Set<string>();
  const keepNames = new Set<string>();
  for (const row of data.users) {
    await upsertOne(row);
    keepNames.add(row.name);
    if (row.wecomUserId) keepWecom.add(row.wecomUserId);
  }

  if (pruneDemo) {
    console.log("→ 清理 @example.com 演示账号…");
    await pruneDemoUsers(keepNames, keepWecom);
  }

  const total = await prisma.user.count();
  const costs = await prisma.personnelMonthlyCostAdjustment.count();
  console.log(`\n完成。当前库用户：${total}，人·月成本：${costs}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
