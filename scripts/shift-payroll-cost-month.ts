/**
 * 工资表导入曾按「表名月份」（发薪/缴纳月）写入 CRM，实际应存上一月（归属月）。
 * 本脚本只把工资月成本记录整体前移一格，不碰打卡、日报、排班等。
 *
 * 用法：
 *   npx tsx scripts/shift-payroll-cost-month.ts          # dry-run
 *   npx tsx scripts/shift-payroll-cost-month.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import {
  computeMonthlyCost,
  countMonthWorkdays,
  resolveDailyRateForMonth,
  resolveEffectiveMonthlyCost,
  shiftYearMonth,
} from "../src/lib/personnel/daily-rate";

const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function isPayrollRow(row: {
  payrollEntity: string | null;
  bonus: unknown;
  payableWage: unknown;
  netPay: unknown;
  incomeTax: unknown;
  socialSecurityPersonal: unknown;
  housingFundPersonal: unknown;
  pensionPersonal: unknown;
  performancePay: unknown;
  wageAdjust: unknown;
}): boolean {
  return (
    row.payrollEntity != null ||
    row.bonus != null ||
    row.payableWage != null ||
    row.netPay != null ||
    row.incomeTax != null ||
    row.socialSecurityPersonal != null ||
    row.housingFundPersonal != null ||
    row.pensionPersonal != null ||
    row.performancePay != null ||
    row.wageAdjust != null
  );
}

async function main() {
  const all = await p.personnelMonthlyCostAdjustment.findMany({
    include: { user: { select: { name: true } } },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  const payroll = all.filter(isPayrollRow);
  const payrollIds = new Set(payroll.map((r) => r.id));
  const byUserMonth = new Map(
    all.map((r) => [`${r.userId}:${r.year}-${r.month}`, r] as const)
  );

  console.log(
    `月成本总 ${all.length} 条；识别为工资表导入 ${payroll.length} 条；其余 ${all.length - payroll.length} 条不动`
  );
  if (!APPLY) console.log("（dry-run，不会写库；加 --apply 才执行）");

  const moves: Array<{
    id: string;
    name: string;
    from: string;
    to: string;
    replaceBackfillId: string | null;
  }> = [];

  for (const row of payroll) {
    const to = shiftYearMonth(row.year, row.month, -1);
    const fromKey = `${row.year}-${String(row.month).padStart(2, "0")}`;
    const toKey = `${to.year}-${String(to.month).padStart(2, "0")}`;
    const occupant = byUserMonth.get(`${row.userId}:${to.year}-${to.month}`);
    const replaceBackfillId =
      occupant && !payrollIds.has(occupant.id) ? occupant.id : null;
    moves.push({
      id: row.id,
      name: row.user.name,
      from: fromKey,
      to: toKey,
      replaceBackfillId,
    });
  }

  const replaced = moves.filter((m) => m.replaceBackfillId);
  console.log(`将平移 ${moves.length} 条；其中 ${replaced.length} 条会覆盖同人同月的非工资回填记录`);
  for (const m of replaced) {
    console.log(`  覆盖回填：${m.name} ${m.to} ← 原 ${m.from}`);
  }

  const byFrom = new Map<string, number>();
  const byTo = new Map<string, number>();
  for (const m of moves) {
    byFrom.set(m.from, (byFrom.get(m.from) ?? 0) + 1);
    byTo.set(m.to, (byTo.get(m.to) ?? 0) + 1);
  }
  console.log("\n发薪月 → 归属月（条数）");
  for (const from of [...byFrom.keys()].sort()) {
    const sample = moves.find((m) => m.from === from)!;
    console.log(`  ${from} → ${sample.to}  (${byFrom.get(from)})`);
  }

  if (!APPLY) {
    console.log("\n未写库。确认后执行：npx tsx scripts/shift-payroll-cost-month.ts --apply");
    return;
  }

  const YEAR_PARK = 3000;

  await p.$transaction(
    async (tx) => {
      for (const row of payroll) {
        await tx.personnelMonthlyCostAdjustment.update({
          where: { id: row.id },
          data: { year: row.year + YEAR_PARK },
        });
      }

      for (const m of moves) {
        if (m.replaceBackfillId) {
          await tx.personnelMonthlyCostAdjustment.delete({
            where: { id: m.replaceBackfillId },
          });
        }
      }

      for (const row of payroll) {
        const to = shiftYearMonth(row.year, row.month, -1);
        const attendanceDays = countMonthWorkdays(new Date(to.year, to.month - 1, 1));
        const copiedFrom =
          row.copiedFromYear != null && row.copiedFromMonth != null
            ? shiftYearMonth(row.copiedFromYear, row.copiedFromMonth, -1)
            : null;
        await tx.personnelMonthlyCostAdjustment.update({
          where: { id: row.id },
          data: {
            year: to.year,
            month: to.month,
            attendanceDays,
            copiedFromYear: copiedFrom?.year ?? row.copiedFromYear,
            copiedFromMonth: copiedFrom?.month ?? row.copiedFromMonth,
          },
        });
      }
    },
    { timeout: 120_000 }
  );

  const latest = await p.personnelMonthlyCostAdjustment.findMany({
    where: { id: { in: [...payrollIds] }, confirmedAt: { not: null } },
    select: {
      userId: true,
      year: true,
      month: true,
      baseSalary: true,
      socialSecurityCompany: true,
      housingFundCompany: true,
      adjustmentAmount: true,
      leaveDeductionAmount: true,
      bonus: true,
      penaltyAmount: true,
      attendanceDays: true,
    },
  });
  const latestByUser = new Map<string, (typeof latest)[0]>();
  for (const row of latest) {
    const prev = latestByUser.get(row.userId);
    if (
      !prev ||
      row.year > prev.year ||
      (row.year === prev.year && row.month > prev.month)
    ) {
      latestByUser.set(row.userId, row);
    }
  }

  let rateUpdated = 0;
  for (const row of latestByUser.values()) {
    const profile = await p.personnelProfile.findUnique({
      where: { userId: row.userId },
      select: { userId: true },
    });
    if (!profile) continue;
    const fixed = computeMonthlyCost({
      baseSalary: row.baseSalary != null ? Number(row.baseSalary) : null,
      socialSecurityCompany:
        row.socialSecurityCompany != null ? Number(row.socialSecurityCompany) : null,
      housingFundCompany:
        row.housingFundCompany != null ? Number(row.housingFundCompany) : null,
    });
    const effective = resolveEffectiveMonthlyCost(
      fixed,
      Number(row.adjustmentAmount),
      Number(row.leaveDeductionAmount ?? 0),
      {
        bonus: Number(row.bonus ?? 0),
        penaltyAmount: Number(row.penaltyAmount ?? 0),
      }
    );
    const dailyRate = resolveDailyRateForMonth(
      effective,
      row.year,
      row.month,
      row.attendanceDays
    );
    await p.personnelProfile.update({
      where: { userId: row.userId },
      data: { dailyRate },
    });
    rateUpdated += 1;
  }

  console.log(`\n✓ 已平移 ${moves.length} 条工资月成本；删除回填 ${replaced.length} 条`);
  console.log(`✓ 仅刷新档案日单价缓存 ${rateUpdated} 人（未改打卡/日报）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
