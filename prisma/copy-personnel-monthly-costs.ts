/**
 * 将指定模板月的人员成本复制到目标月份区间（已有记录则更新成本字段，保留 notes/id）。
 * 默认：以 2026-06 为模板，覆盖 2025-01 ~ 2026-07。
 *
 * 用法：
 *   npx tsx prisma/copy-personnel-monthly-costs.ts
 *   npx tsx prisma/copy-personnel-monthly-costs.ts --from=2026-06 --start=2025-01 --end=2026-07 --dry-run
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseYm(raw: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{1,2})$/.exec(raw.trim());
  if (!m) throw new Error(`无效年月：${raw}（期望 YYYY-MM）`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`无效月份：${raw}`);
  return { year, month };
}

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

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const from = parseYm(argValue("from") ?? "2026-06");
  const start = parseYm(argValue("start") ?? "2025-01");
  const end = parseYm(argValue("end") ?? "2026-07");

  const templates = await prisma.personnelMonthlyCostAdjustment.findMany({
    where: { year: from.year, month: from.month },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { userId: "asc" },
  });

  if (templates.length === 0) {
    throw new Error(`模板月 ${ymKey(from.year, from.month)} 没有任何人员成本记录`);
  }

  const targets = listMonthsInclusive(start, end).filter(
    (ym) => !(ym.year === from.year && ym.month === from.month)
  );

  console.log(
    `模板 ${ymKey(from.year, from.month)}：${templates.length} 人；目标月份 ${targets.length} 个（${ymKey(start.year, start.month)} ~ ${ymKey(end.year, end.month)}，不含模板月）`
  );
  if (dryRun) console.log("（dry-run，不写库）");

  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    for (const ym of targets) {
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
        adjustmentAmount: tpl.adjustmentAmount,
        notes:
          existing?.notes?.trim() ||
          `由 ${ymKey(from.year, from.month)} 成本同步`,
      };

      if (dryRun) {
        if (existing) updated += 1;
        else created += 1;
        continue;
      }

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
