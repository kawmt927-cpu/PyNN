/**
 * 修复并回填人员月成本：
 * - 模板优先用 2026-06 中「固定月成本 > 0」的记录
 * - 否则回退到 PersonnelProfile 档案成本
 * - 写入 2025-01 ~ 2026-07（含模板月）
 *
 * 用法：npx tsx prisma/backfill-personnel-monthly-costs.ts
 */
import { PrismaClient } from "@prisma/client";
import { computeMonthlyCost } from "../src/lib/personnel/daily-rate";

const prisma = new PrismaClient();

function ymKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function listMonthsInclusive(
  start: { year: number; month: number },
  end: { year: number; month: number }
) {
  const out: Array<{ year: number; month: number }> = [];
  let y = start.year;
  let m = start.month;
  while (y < end.year || (y === end.year && m <= end.month)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

type CostTemplate = {
  userId: string;
  name: string;
  contributionBase: number | null;
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
  adjustmentAmount: number;
  source: string;
};

async function main() {
  const start = { year: 2025, month: 1 };
  const end = { year: 2026, month: 7 };
  const templateYm = { year: 2026, month: 6 };
  const months = listMonthsInclusive(start, end);

  const [profiles, juneRows] = await Promise.all([
    prisma.personnelProfile.findMany({
      where: { enabled: true },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.personnelMonthlyCostAdjustment.findMany({
      where: { year: templateYm.year, month: templateYm.month },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const juneByUser = new Map(juneRows.map((row) => [row.userId, row]));
  const templates: CostTemplate[] = [];

  for (const profile of profiles) {
    const june = juneByUser.get(profile.userId);
    const juneCost = june
      ? computeMonthlyCost({
          baseSalary: num(june.baseSalary),
          socialSecurityCompany: num(june.socialSecurityCompany),
          housingFundCompany: num(june.housingFundCompany),
        })
      : null;
    const profileCost = computeMonthlyCost({
      baseSalary: num(profile.baseSalary),
      socialSecurityCompany: num(profile.socialSecurityCompany),
      housingFundCompany: num(profile.housingFundCompany),
    });

    if (juneCost != null && juneCost > 0 && june) {
      templates.push({
        userId: profile.userId,
        name: profile.user.name,
        contributionBase: num(june.contributionBase),
        baseSalary: num(june.baseSalary),
        socialSecurityCompany: num(june.socialSecurityCompany),
        housingFundCompany: num(june.housingFundCompany),
        adjustmentAmount: Number(june.adjustmentAmount),
        source: ymKey(templateYm.year, templateYm.month),
      });
      continue;
    }

    if (profileCost != null && profileCost > 0) {
      templates.push({
        userId: profile.userId,
        name: profile.user.name,
        contributionBase: num(profile.contributionBase),
        baseSalary: num(profile.baseSalary),
        socialSecurityCompany: num(profile.socialSecurityCompany),
        housingFundCompany: num(profile.housingFundCompany),
        adjustmentAmount: 0,
        source: "personnelProfile",
      });
    }
  }

  // 仅有 6 月记录、无档案的人（极少）也带上
  for (const june of juneRows) {
    if (templates.some((t) => t.userId === june.userId)) continue;
    const juneCost = computeMonthlyCost({
      baseSalary: num(june.baseSalary),
      socialSecurityCompany: num(june.socialSecurityCompany),
      housingFundCompany: num(june.housingFundCompany),
    });
    if (juneCost == null || juneCost <= 0) continue;
    templates.push({
      userId: june.userId,
      name: june.user.name,
      contributionBase: num(june.contributionBase),
      baseSalary: num(june.baseSalary),
      socialSecurityCompany: num(june.socialSecurityCompany),
      housingFundCompany: num(june.housingFundCompany),
      adjustmentAmount: Number(june.adjustmentAmount),
      source: ymKey(templateYm.year, templateYm.month),
    });
  }

  console.log(`将写入 ${templates.length} 人 × ${months.length} 月`);
  for (const t of templates) {
    const total = computeMonthlyCost(t);
    console.log(`- ${t.name}: ¥${total}（来源 ${t.source}）`);
  }

  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    for (const ym of months) {
      const existing = await prisma.personnelMonthlyCostAdjustment.findUnique({
        where: {
          userId_year_month: {
            userId: tpl.userId,
            year: ym.year,
            month: ym.month,
          },
        },
      });

      const data = {
        contributionBase: tpl.contributionBase,
        baseSalary: tpl.baseSalary,
        socialSecurityCompany: tpl.socialSecurityCompany,
        housingFundCompany: tpl.housingFundCompany,
        // 仅模板月保留原调整额；其他月不带请假等调整
        adjustmentAmount:
          ym.year === templateYm.year && ym.month === templateYm.month
            ? tpl.adjustmentAmount
            : 0,
        notes: `由 ${tpl.source} 同步`,
      };

      if (existing) {
        await prisma.personnelMonthlyCostAdjustment.update({
          where: { id: existing.id },
          data,
        });
        updated += 1;
      } else {
        await prisma.personnelMonthlyCostAdjustment.create({
          data: {
            userId: tpl.userId,
            year: ym.year,
            month: ym.month,
            ...data,
          },
        });
        created += 1;
      }
    }
  }

  console.log(`完成：新建 ${created}，更新 ${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
