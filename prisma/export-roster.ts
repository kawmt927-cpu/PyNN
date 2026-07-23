/**
 * 从当前 DATABASE_URL 导出公司人员（含档案与月成本），供同步到线上。
 * 用法：npx tsx prisma/export-roster.ts [输出路径]
 * 默认输出：tmp/roster-sync.json
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
      personnelProfile: u.personnelProfile
        ? {
            staffCategory: u.personnelProfile.staffCategory,
            personnelType: u.personnelProfile.personnelType,
            isPresales: u.personnelProfile.isPresales,
            contributionBase: u.personnelProfile.contributionBase?.toString() ?? null,
            baseSalary: u.personnelProfile.baseSalary?.toString() ?? null,
            socialSecurityCompany: u.personnelProfile.socialSecurityCompany?.toString() ?? null,
            housingFundCompany: u.personnelProfile.housingFundCompany?.toString() ?? null,
            dailyRate: u.personnelProfile.dailyRate?.toString() ?? null,
            enabled: u.personnelProfile.enabled,
          }
        : null,
      monthlyCostAdjustments: u.monthlyCostAdjustments.map((m) => ({
        year: m.year,
        month: m.month,
        contributionBase: m.contributionBase?.toString() ?? null,
        baseSalary: m.baseSalary?.toString() ?? null,
        socialSecurityCompany: m.socialSecurityCompany?.toString() ?? null,
        housingFundCompany: m.housingFundCompany?.toString() ?? null,
        adjustmentAmount: m.adjustmentAmount.toString(),
        notes: m.notes,
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
