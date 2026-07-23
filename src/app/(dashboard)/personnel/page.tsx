import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonnelCostBatchEditor } from "@/components/personnel/personnel-cost-batch-editor";
import { PersonnelInfoTable } from "@/components/personnel/personnel-info-table";
import { PersonnelMonthPicker } from "@/components/personnel/personnel-month-picker";
import {
  PersonnelTabs,
  type PersonnelTabId,
} from "@/components/personnel/personnel-tabs";
import { getPersonAllocationSplit } from "@/lib/projects/cost-summary";
import {
  computeMonthlyCost,
  countMonthWorkdays,
  parseYearMonthParam,
  resolveEffectiveMonthlyCost,
  shiftYearMonth,
} from "@/lib/personnel/daily-rate";
import { resolveMonthCostFromHistory } from "@/lib/personnel/resolve-month-cost";
import { endOfMonth, startOfMonth } from "date-fns";

type Props = {
  searchParams: Promise<{ tab?: string; year?: string; month?: string }>;
};

function costsHref(year: number, month: number) {
  return `/personnel?tab=costs&year=${year}&month=${month}`;
}

function parseTab(raw: string | undefined): PersonnelTabId {
  return raw === "costs" ? "costs" : "info";
}

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

export default async function PersonnelPage({ searchParams }: Props) {
  await requireRole(["PROJECT_ADMIN", "ADMIN"]);

  const params = await searchParams;
  const activeTab = parseTab(params.tab);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { year, month } =
    activeTab === "costs"
      ? parseYearMonthParam(params.year, params.month, now)
      : { year: currentYear, month: currentMonth };

  const monthDate = new Date(year, month - 1, 1);
  const monthWorkdays = countMonthWorkdays(monthDate);
  const monthRange = {
    from: startOfMonth(monthDate),
    to: endOfMonth(monthDate),
  };
  const prev = shiftYearMonth(year, month, -1);
  const next = shiftYearMonth(year, month, 1);

  const users = await prisma.user.findMany({
    where: {
      personnelProfile: {
        staffCategory: "IMPLEMENTATION",
        enabled: true,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      personnelProfile: {
        select: { personnelType: true },
      },
      staffAllocations: {
        select: { projectId: true },
      },
      monthlyCostAdjustments: {
        where: {
          OR: [
            { year: { lt: year } },
            { year, month: { lte: month } },
          ],
        },
        select: {
          year: true,
          month: true,
          contributionBase: true,
          baseSalary: true,
          socialSecurityCompany: true,
          housingFundCompany: true,
          adjustmentAmount: true,
          notes: true,
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const items = await Promise.all(
    users.map(async (user) => {
      const { totalDays, totalCost } = await getPersonAllocationSplit(
        user.id,
        monthRange
      );
      const projectCount = new Set(user.staffAllocations.map((a) => a.projectId)).size;
      const history = user.monthlyCostAdjustments.map((row) => ({
        year: row.year,
        month: row.month,
        contributionBase: num(row.contributionBase),
        baseSalary: num(row.baseSalary),
        socialSecurityCompany: num(row.socialSecurityCompany),
        housingFundCompany: num(row.housingFundCompany),
        adjustmentAmount: Number(row.adjustmentAmount),
        notes: row.notes ?? "",
      }));
      const resolved = resolveMonthCostFromHistory(history, year, month);

      const contributionBase = resolved?.contributionBase ?? null;
      const baseSalary = resolved?.baseSalary ?? null;
      const socialSecurityCompany = resolved?.socialSecurityCompany ?? null;
      const housingFundCompany = resolved?.housingFundCompany ?? null;
      const monthAdjustment = resolved?.adjustmentAmount ?? 0;
      const monthlyCost = computeMonthlyCost({
        baseSalary,
        socialSecurityCompany,
        housingFundCompany,
      });
      const effectiveMonthlyCost = resolveEffectiveMonthlyCost(
        monthlyCost,
        monthAdjustment
      );

      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        personnelType: user.personnelProfile?.personnelType ?? null,
        contributionBase,
        baseSalary,
        socialSecurityCompany,
        housingFundCompany,
        monthAdjustment,
        monthAdjustmentNotes: resolved?.notes ?? "",
        monthlyCost,
        effectiveMonthlyCost,
        weekEffectiveDays: totalDays,
        weekCost: totalCost,
        projectCount,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">实施人员</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeTab === "info"
            ? "查看人员基本信息与当月投入概况；类型可在此维护。"
            : "按月维护人员成本（含历史）；无当月记录时沿用上月成本；项目成本按「有效月成本 ÷ 当月实际工作日」实时核算。"}
        </p>
      </div>

      <PersonnelTabs activeTab={activeTab} costsHref={costsHref(year, month)} />

      {activeTab === "info" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              人员信息
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({items.length} 人 · 当月 {year}年{month}月 · {monthWorkdays} 个工作日)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PersonnelInfoTable
              items={items.map((item) => ({
                userId: item.userId,
                name: item.name,
                email: item.email,
                personnelType: item.personnelType,
                monthlyCost: item.monthlyCost,
                effectiveMonthlyCost: item.effectiveMonthlyCost,
                monthAdjustment: item.monthAdjustment,
                monthEffectiveDays: item.weekEffectiveDays,
                monthCost: item.weekCost,
                projectCount: item.projectCount,
              }))}
              year={year}
              month={month}
              monthWorkdays={monthWorkdays}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={costsHref(prev.year, prev.month)}>上一月</Link>
            </Button>
            <PersonnelMonthPicker year={year} month={month} />
            <Button variant="outline" size="sm" asChild>
              <Link href={costsHref(next.year, next.month)}>下一月</Link>
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                月成本批量编辑
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({items.length} 人 · {year}年{month}月 · {monthWorkdays} 个工作日)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PersonnelCostBatchEditor
                key={`${year}-${month}`}
                items={items}
                year={year}
                month={month}
                monthWorkdays={monthWorkdays}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
