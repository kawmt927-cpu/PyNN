/**
 * 从当前 DATABASE_URL 导出公司人员（含档案与月成本/工资条），供同步到线上。
 * 用法：npx tsx prisma/export-roster.ts [输出路径]
 * 默认输出：tmp/roster-sync.json
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function decStr(v: { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

async function main() {
  const outPath = path.resolve(
    process.argv[2] ?? path.join(process.cwd(), "tmp", "roster-sync.json")
  );

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: {
      personnelProfile: true,
      monthlyCostAdjustments: true,
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    count: users.length,
    users: users.map((u) => ({
      name: u.name,
      email: u.email,
      phone: u.phone,
      wecomUserId: u.wecomUserId,
      role: u.role,
      passwordHash: u.passwordHash,
      includeInTeamPerformance: u.includeInTeamPerformance,
      includeInMonthlyAssessment: u.includeInMonthlyAssessment,
      personnelProfile: u.personnelProfile
        ? {
            staffCategory: u.personnelProfile.staffCategory,
            personnelType: u.personnelProfile.personnelType,
            isPresales: u.personnelProfile.isPresales,
            contributionBase: decStr(u.personnelProfile.contributionBase),
            baseSalary: decStr(u.personnelProfile.baseSalary),
            socialSecurityCompany: decStr(u.personnelProfile.socialSecurityCompany),
            housingFundCompany: decStr(u.personnelProfile.housingFundCompany),
            dailyRate: decStr(u.personnelProfile.dailyRate),
            enabled: u.personnelProfile.enabled,
          }
        : null,
      monthlyCostAdjustments: u.monthlyCostAdjustments.map((m) => ({
        year: m.year,
        month: m.month,
        contributionBase: decStr(m.contributionBase),
        baseSalary: decStr(m.baseSalary),
        socialSecurityCompany: decStr(m.socialSecurityCompany),
        housingFundCompany: decStr(m.housingFundCompany),
        adjustmentAmount: m.adjustmentAmount.toString(),
        leaveDeductionAmount: m.leaveDeductionAmount.toString(),
        attendanceDays: m.attendanceDays,
        payrollEntity: m.payrollEntity,
        seniorityYears: decStr(m.seniorityYears),
        bonus: decStr(m.bonus),
        performancePay: decStr(m.performancePay),
        wageAdjust: decStr(m.wageAdjust),
        sickLeaveDays: decStr(m.sickLeaveDays),
        sickLeaveDeduction: decStr(m.sickLeaveDeduction),
        personalLeaveDays: decStr(m.personalLeaveDays),
        personalLeaveDeduction: decStr(m.personalLeaveDeduction),
        payableWage: decStr(m.payableWage),
        pensionPersonal: decStr(m.pensionPersonal),
        medicalPersonal: decStr(m.medicalPersonal),
        unemploymentPersonal: decStr(m.unemploymentPersonal),
        socialSecurityPersonal: decStr(m.socialSecurityPersonal),
        housingFundPersonal: decStr(m.housingFundPersonal),
        incomeTax: decStr(m.incomeTax),
        netPay: decStr(m.netPay),
        notes: m.notes,
        confirmedAt: m.confirmedAt?.toISOString() ?? null,
      })),
    })),
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✓ 已导出 ${payload.count} 人 → ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
