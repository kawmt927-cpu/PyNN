/**
 * 按 JSON 清单 upsert 人员到当前 DATABASE_URL（不清客户/合同等业务数据）。
 * 匹配键：wecomUserId（必填）；无企微 ID 的记录跳过。
 *
 * 用法：npx tsx prisma/upsert-roster-from-json.ts [json路径]
 * 默认：tmp/roster-sync.json
 *
 * 可选：--prune-demo 删除仍带 @example.com 且不在本次清单中的演示账号（无业务关联时）
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

async function upsertOne(row: ExportUser) {
  const wecomUserId = row.wecomUserId?.trim();
  if (!wecomUserId) {
    console.warn(`  跳过（无企微 ID）：${row.name}`);
    return;
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

  const existing = await prisma.user.findUnique({ where: { wecomUserId } });

  let userId: string;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: row.name,
        role: row.role,
        email: row.email,
        phone: row.phone,
        passwordHash: row.passwordHash,
      },
    });
    userId = existing.id;

    if (existing) {
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
    }
    console.log(`  ↑ 更新 ${row.name}（${wecomUserId}）·${row.role}`);
  } else {
    // 手机号冲突时不覆盖他人
    if (row.phone) {
      const phoneTaken = await prisma.user.findUnique({ where: { phone: row.phone } });
      if (phoneTaken && phoneTaken.wecomUserId !== wecomUserId) {
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
        personnelProfile: { create: profileData },
      },
    });
    userId = created.id;
    console.log(`  + 新建 ${row.name}（${wecomUserId}）·${row.role}`);
  }

  if (row.monthlyCostAdjustments?.length) {
    for (const m of row.monthlyCostAdjustments) {
      await prisma.personnelMonthlyCostAdjustment.upsert({
        where: {
          userId_year_month: { userId, year: m.year, month: m.month },
        },
        create: {
          userId,
          year: m.year,
          month: m.month,
          contributionBase: dec(m.contributionBase),
          baseSalary: dec(m.baseSalary),
          socialSecurityCompany: dec(m.socialSecurityCompany),
          housingFundCompany: dec(m.housingFundCompany),
          adjustmentAmount: new Prisma.Decimal(m.adjustmentAmount || "0"),
          notes: m.notes,
        },
        update: {
          contributionBase: dec(m.contributionBase),
          baseSalary: dec(m.baseSalary),
          socialSecurityCompany: dec(m.socialSecurityCompany),
          housingFundCompany: dec(m.housingFundCompany),
          adjustmentAmount: new Prisma.Decimal(m.adjustmentAmount || "0"),
          notes: m.notes,
        },
      });
    }
  }
}

async function pruneDemoUsers(keepWecomIds: Set<string>) {
  const demos = await prisma.user.findMany({
    where: {
      email: { endsWith: "@example.com" },
      OR: [{ wecomUserId: null }, { wecomUserId: { notIn: [...keepWecomIds] } }],
    },
    select: { id: true, name: true, email: true, wecomUserId: true },
  });

  for (const u of demos) {
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
  for (const row of data.users) {
    await upsertOne(row);
    if (row.wecomUserId) keepWecom.add(row.wecomUserId);
  }

  if (pruneDemo) {
    console.log("→ 清理 @example.com 演示账号…");
    await pruneDemoUsers(keepWecom);
  }

  const total = await prisma.user.count();
  console.log(`\n完成。当前库用户总数：${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
