/**
 * 按薪酬表导入实施人员成本分项，并按「总支出 ÷ 当月工作日」写入日单价。
 * 用法：npx tsx prisma/seed-personnel-costs.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, StaffCategory, PersonnelType } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";

const prisma = new PrismaClient();

type StaffCostRow = {
  name: string;
  email: string;
  contributionBase: number | null;
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
};

const STAFF_ROWS: StaffCostRow[] = [
  {
    name: "纪超",
    email: "jichao@example.com",
    contributionBase: 17600,
    baseSalary: 22000,
    socialSecurityCompany: 4347.2,
    housingFundCompany: 1408,
  },
  {
    name: "毛海斌",
    email: "maohaibin@example.com",
    contributionBase: 11500,
    baseSalary: 11500,
    socialSecurityCompany: 2955.5,
    housingFundCompany: 920,
  },
  {
    name: "臧天民",
    email: "zangtianmin@example.com",
    contributionBase: 6000,
    baseSalary: 7000,
    socialSecurityCompany: 1482,
    housingFundCompany: 480,
  },
  {
    name: "郁志翔",
    email: "yuzhixiang@example.com",
    contributionBase: 6500,
    baseSalary: 7500,
    socialSecurityCompany: 1605.5,
    housingFundCompany: 520,
  },
  {
    name: "杜正宁",
    email: "duzhengning@example.com",
    contributionBase: 6000,
    baseSalary: 7000,
    socialSecurityCompany: 1482,
    housingFundCompany: 480,
  },
  {
    name: "刘晋江",
    email: "liujinjiang@example.com",
    contributionBase: 4952,
    baseSalary: 7000,
    socialSecurityCompany: 1223.15,
    housingFundCompany: 384,
  },
  {
    name: "王康",
    email: "wangkang@example.com",
    contributionBase: 6000,
    baseSalary: 6000,
    socialSecurityCompany: 1482,
    housingFundCompany: 480,
  },
  {
    name: "李德陈",
    email: "lidechen@example.com",
    contributionBase: 4952,
    baseSalary: 7000,
    socialSecurityCompany: 1223.15,
    housingFundCompany: 384,
  },
  {
    name: "林仁康",
    email: "linrenkang@example.com",
    contributionBase: 4879,
    baseSalary: 6000,
    socialSecurityCompany: 1205.11,
    housingFundCompany: 384,
  },
  {
    name: "贾超群",
    email: "jiachaoqun@example.com",
    contributionBase: 4952,
    baseSalary: 6000,
    socialSecurityCompany: 1223.15,
    housingFundCompany: 240,
  },
  {
    name: "林贤庆",
    email: "linxianqing@example.com",
    contributionBase: 4952,
    baseSalary: 6800,
    socialSecurityCompany: 1223.15,
    housingFundCompany: 384,
  },
  {
    name: "田玉杰",
    email: "tianyujie@example.com",
    contributionBase: 4952,
    baseSalary: 6500,
    socialSecurityCompany: 1223.15,
    housingFundCompany: 240,
  },
  {
    name: "侯海峰",
    email: "houhaifeng@example.com",
    contributionBase: 4952,
    baseSalary: 6000,
    socialSecurityCompany: 1223.15,
    housingFundCompany: 199,
  },
  {
    name: "郑世超",
    email: "zhengshichao@example.com",
    contributionBase: null,
    baseSalary: 5600,
    socialSecurityCompany: null,
    housingFundCompany: null,
  },
  {
    name: "徐鸽",
    email: "xuge@example.com",
    contributionBase: 2500,
    baseSalary: 18400,
    socialSecurityCompany: 1246.83,
    housingFundCompany: 200,
  },
];

function isWorkday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function countMonthWorkdays(reference = new Date()): number {
  const from = startOfMonth(reference);
  const to = endOfMonth(reference);
  let count = 0;
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    if (isWorkday(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeDailyRate(row: StaffCostRow, workdays: number): number | null {
  const parts = [row.baseSalary, row.socialSecurityCompany, row.housingFundCompany];
  if (parts.every((v) => v == null)) return null;
  if (workdays <= 0) return null;
  const total = parts.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  return roundMoney(total / workdays);
}

async function upsertStaff(row: StaffCostRow, passwordHash: string, workdays: number) {
  const dailyRate = computeDailyRate(row, workdays);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const existing = await prisma.user.findUnique({
    where: { email: row.email },
    select: { id: true },
  });

  let userId: string;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: row.name,
        role: UserRole.PROJECT_STAFF,
        personnelProfile: {
          upsert: {
            create: {
              staffCategory: StaffCategory.IMPLEMENTATION,
              personnelType: PersonnelType.IMPLEMENTER,
              enabled: true,
              contributionBase: row.contributionBase,
              baseSalary: row.baseSalary,
              socialSecurityCompany: row.socialSecurityCompany,
              housingFundCompany: row.housingFundCompany,
              dailyRate,
            },
            update: {
              staffCategory: StaffCategory.IMPLEMENTATION,
              personnelType: PersonnelType.IMPLEMENTER,
              enabled: true,
              contributionBase: row.contributionBase,
              baseSalary: row.baseSalary,
              socialSecurityCompany: row.socialSecurityCompany,
              housingFundCompany: row.housingFundCompany,
              dailyRate,
            },
          },
        },
      },
    });
    userId = existing.id;
  } else {
    const created = await prisma.user.create({
      data: {
        email: row.email,
        name: row.name,
        passwordHash,
        role: UserRole.PROJECT_STAFF,
        personnelProfile: {
          create: {
            staffCategory: StaffCategory.IMPLEMENTATION,
            personnelType: PersonnelType.IMPLEMENTER,
            enabled: true,
            contributionBase: row.contributionBase,
            baseSalary: row.baseSalary,
            socialSecurityCompany: row.socialSecurityCompany,
            housingFundCompany: row.housingFundCompany,
            dailyRate,
          },
        },
      },
    });
    userId = created.id;
  }

  await prisma.personnelMonthlyCostAdjustment.upsert({
    where: {
      userId_year_month: { userId, year, month },
    },
    create: {
      userId,
      year,
      month,
      contributionBase: row.contributionBase,
      baseSalary: row.baseSalary,
      socialSecurityCompany: row.socialSecurityCompany,
      housingFundCompany: row.housingFundCompany,
      adjustmentAmount: 0,
    },
    update: {
      contributionBase: row.contributionBase,
      baseSalary: row.baseSalary,
      socialSecurityCompany: row.socialSecurityCompany,
      housingFundCompany: row.housingFundCompany,
    },
  });

  return {
    name: row.name,
    email: row.email,
    dailyRate,
    created: !existing,
  };
}

async function main() {
  const workdays = countMonthWorkdays();
  const passwordHash = await bcrypt.hash("proj123", 10);
  console.log(`当月工作日: ${workdays}`);

  for (const row of STAFF_ROWS) {
    const result = await upsertStaff(row, passwordHash, workdays);
    const totalParts = [
      row.baseSalary,
      row.socialSecurityCompany,
      row.housingFundCompany,
    ];
    const total = totalParts.every((v) => v == null)
      ? null
      : roundMoney(totalParts.reduce<number>((sum, v) => sum + (v ?? 0), 0));
    console.log(
      `${result.created ? "新建" : "更新"} ${result.name} (${result.email}) 总支出=${total ?? "—"} 日单价=${result.dailyRate ?? "—"}`
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
