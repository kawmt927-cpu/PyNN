import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonnelCostBatchEditor } from "@/components/personnel/personnel-cost-batch-editor";
import { PersonnelInfoTable } from "@/components/personnel/personnel-info-table";
import { PersonnelMonthPicker } from "@/components/personnel/personnel-month-picker";
import {
  PersonnelTabs,
  type PersonnelTabId,
} from "@/components/personnel/personnel-tabs";
import { HelpHint } from "@/components/ui/help-hint";
import { getPersonAllocationSplit } from "@/lib/projects/cost-summary";
import {
  canAccessPersonnelPage,
  canManagePersonnelCosts,
  canManagePersonnelInfo,
  implementationStaffListWhere,
  shouldHideResignedPeriodMetrics,
} from "@/lib/personnel/access";
import {
  compareYearMonth,
  computeMonthlyCost,
  currentYearMonth,
  parseYearMonthParam,
  resolveEffectiveMonthlyCost,
  shiftYearMonth,
} from "@/lib/personnel/daily-rate";
import { resolveMonthCostFromHistory } from "@/lib/personnel/resolve-month-cost";
import { ensureCurrentMonthCostsMaterialized } from "@/lib/personnel/ensure-month-costs";
import { computeLeaveDeductionPreview } from "@/lib/personnel/leave-pay";
import { ensureDefaultLeaveTypes } from "@/lib/personnel/leave-types";
import { endOfMonth, startOfMonth } from "date-fns";
import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ tab?: string; year?: string; month?: string }>;
};

function costsHref(year: number, month: number) {
  return `/personnel?tab=costs&year=${year}&month=${month}`;
}

function parseTab(
  raw: string | undefined,
  canCosts: boolean,
  canInfo: boolean
): PersonnelTabId {
  if (raw === "costs" && canCosts) return "costs";
  if (raw === "info" && canInfo) return "info";
  if (canCosts && !canInfo) return "costs";
  return "info";
}

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

export default async function PersonnelPage({ searchParams }: Props) {
  const session = await requireRole(["PROJECT_ADMIN", "HR", "ADMIN"]);
  const role = session.user.role;
  if (!canAccessPersonnelPage(role)) {
    redirect("/");
  }

  const canCosts = canManagePersonnelCosts(role);
  const canInfo = canManagePersonnelInfo(role);

  const params = await searchParams;
  const activeTab = parseTab(params.tab, canCosts, canInfo);

  // 无权限的 tab 深链重定向
  if (params.tab === "costs" && !canCosts) {
    redirect("/personnel?tab=info");
  }
  if (params.tab === "info" && !canInfo && canCosts) {
    redirect("/personnel?tab=costs");
  }

  const now = new Date();
  const current = currentYearMonth(now);
  const previous = shiftYearMonth(current.year, current.month, -1);

  // 成本默认看「上个月」（事后确认）；显式传 year/month 时尊重参数
  const requested =
    activeTab === "costs"
      ? params.year || params.month
        ? parseYearMonthParam(params.year, params.month, now)
        : previous
      : current;
  const { year, month } = requested;

  // 深链落到未来月时重定向回当月
  if (
    activeTab === "costs" &&
    params.year != null &&
    params.month != null &&
    (Number(params.year) !== year || Number(params.month) !== month)
  ) {
    redirect(costsHref(year, month));
  }

  if (activeTab === "costs") {
    await ensureCurrentMonthCostsMaterialized(year, month, now);
    await ensureDefaultLeaveTypes();
  }

  const monthDate = new Date(year, month - 1, 1);
  const { countCompanyAttendanceDays } = await import(
    "@/lib/calendar/company-attendance"
  );
  const monthWorkdays = await countCompanyAttendanceDays(year, month);
  const monthRange = {
    from: startOfMonth(monthDate),
    to: endOfMonth(monthDate),
  };
  const prev = shiftYearMonth(year, month, -1);
  const next = shiftYearMonth(year, month, 1);
  const canGoNext = compareYearMonth(next, current) <= 0;

  const users = await prisma.user.findMany({
    where: implementationStaffListWhere(),
    select: {
      id: true,
      name: true,
      email: true,
      personnelProfile: {
        select: { personnelType: true, enabled: true },
      },
      staffAllocations: {
        where: {
          startDate: { lte: monthRange.to },
          endDate: { gte: monthRange.from },
        },
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
          leaveDeductionAmount: true,
          attendanceDays: true,
          attendanceDaysSystem: true,
          notes: true,
          confirmedAt: true,
          payrollEntity: true,
          bonus: true,
          penaltyAmount: true,
          changeSummary: true,
          performancePay: true,
          wageAdjust: true,
          sickLeaveDays: true,
          sickLeaveDeduction: true,
          personalLeaveDays: true,
          personalLeaveDeduction: true,
          payableWage: true,
          pensionPersonal: true,
          medicalPersonal: true,
          unemploymentPersonal: true,
          socialSecurityPersonal: true,
          housingFundPersonal: true,
          incomeTax: true,
          netPay: true,
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
      const resigned = user.personnelProfile?.enabled === false;
      const hideMonthMetrics = shouldHideResignedPeriodMetrics({
        resigned,
        periodEffectiveDays: totalDays,
      });
      const projectCount = hideMonthMetrics
        ? 0
        : new Set(user.staffAllocations.map((a) => a.projectId)).size;
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
      const monthRecord = user.monthlyCostAdjustments.find(
        (row) => row.year === year && row.month === month
      );
      const monthConfirmed = monthRecord?.confirmedAt != null;

      const contributionBase = resolved?.contributionBase ?? null;
      const baseSalary = resolved?.baseSalary ?? null;
      const socialSecurityCompany = resolved?.socialSecurityCompany ?? null;
      const housingFundCompany = resolved?.housingFundCompany ?? null;
      const monthAdjustment = resolved?.adjustmentAmount ?? 0;
      const bonus = monthRecord ? num(monthRecord.bonus) ?? 0 : 0;
      const penaltyAmount = monthRecord ? num(monthRecord.penaltyAmount) ?? 0 : 0;
      const leavePreview =
        activeTab === "costs"
          ? await computeLeaveDeductionPreview({
              userId: user.id,
              year,
              month,
              baseSalary,
              socialSecurityCompany,
              housingFundCompany,
            })
          : {
              leaveDeductionTotal: monthRecord
                ? Number(monthRecord.leaveDeductionAmount ?? 0)
                : 0,
              attendanceDays: monthRecord?.attendanceDays ?? 0,
              absenceDays: 0,
            };
      // 已确认：展示锁定值；待确认：展示关账预览（与保存时计算一致）
      const leaveDeductionAmount = monthConfirmed
        ? Number(monthRecord?.leaveDeductionAmount ?? 0)
        : leavePreview.leaveDeductionTotal;
      const systemAttendanceDays = leavePreview.attendanceDays;
      const attendanceDays = monthConfirmed
        ? (monthRecord?.attendanceDays ?? systemAttendanceDays)
        : systemAttendanceDays;
      // 历史无系统快照时，用锁定出勤本身，避免误标「已手工修改」
      const attendanceDaysSystem = monthConfirmed
        ? (monthRecord?.attendanceDaysSystem ??
          monthRecord?.attendanceDays ??
          systemAttendanceDays)
        : systemAttendanceDays;
      const absenceDays = leavePreview.absenceDays;
      const monthlyCost = computeMonthlyCost({
        baseSalary,
        socialSecurityCompany,
        housingFundCompany,
      });
      const effectiveMonthlyCost = resolveEffectiveMonthlyCost(
        monthlyCost,
        monthAdjustment,
        leaveDeductionAmount,
        { bonus, penaltyAmount }
      );

      const payrollSlip =
        monthRecord != null
          ? {
              userId: user.id,
              name: user.name,
              year,
              month,
              payrollEntity: monthRecord.payrollEntity,
              contributionBase,
              baseSalary,
              bonus: num(monthRecord.bonus),
              penaltyAmount,
              performancePay: num(monthRecord.performancePay),
              wageAdjust: num(monthRecord.wageAdjust),
              sickLeaveDays: num(monthRecord.sickLeaveDays),
              sickLeaveDeduction: num(monthRecord.sickLeaveDeduction),
              personalLeaveDays: num(monthRecord.personalLeaveDays),
              personalLeaveDeduction: num(monthRecord.personalLeaveDeduction),
              payableWage: num(monthRecord.payableWage),
              socialSecurityCompany,
              housingFundCompany,
              pensionPersonal: num(monthRecord.pensionPersonal),
              medicalPersonal: num(monthRecord.medicalPersonal),
              unemploymentPersonal: num(monthRecord.unemploymentPersonal),
              socialSecurityPersonal: num(monthRecord.socialSecurityPersonal),
              housingFundPersonal: num(monthRecord.housingFundPersonal),
              incomeTax: num(monthRecord.incomeTax),
              netPay: num(monthRecord.netPay),
              adjustmentAmount: monthAdjustment,
              leaveDeductionAmount,
              companyMonthlyCost: monthlyCost,
              effectiveMonthlyCost,
              notes: monthRecord.notes,
            }
          : null;

      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        personnelType: user.personnelProfile?.personnelType ?? null,
        contributionBase,
        baseSalary,
        socialSecurityCompany,
        housingFundCompany,
        bonus,
        penaltyAmount,
        monthAdjustment,
        leaveDeductionAmount,
        attendanceDays,
        attendanceDaysSystem,
        absenceDays,
        changeSummary: monthRecord?.changeSummary ?? null,
        monthlyCost,
        effectiveMonthlyCost,
        monthConfirmed,
        hasMonthRecord: monthRecord != null,
        weekEffectiveDays: hideMonthMetrics ? 0 : totalDays,
        weekCost: hideMonthMetrics ? 0 : totalCost,
        projectCount,
        resigned,
        hideMonthMetrics,
        payrollSlip,
      };
    })
  );

  items.sort((a, b) => {
    if (a.resigned !== b.resigned) return a.resigned ? 1 : -1;
    return a.name.localeCompare(b.name, "zh-CN");
  });

  /**
   * 成本页：在职默认纳入；离职默认不出现。
   * 仅当本月已有成本记录（含人事手动「添加离职人员」）时才显示离职人员；下月无记录则仍默认不出现。
   */
  const costItems = items.filter(
    (item) => !item.resigned || item.hasMonthRecord
  );
  const resignedCandidates = items
    .filter((item) => item.resigned && !item.hasMonthRecord)
    .map((item) => ({ userId: item.userId, name: item.name }));
  const recorded = costItems.filter((item) => item.hasMonthRecord);
  const monthFullyConfirmed =
    recorded.length > 0 && recorded.every((item) => item.monthConfirmed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {activeTab === "costs" ? "人员成本" : "实施人员"}
          <HelpHint
            label={activeTab === "costs" ? "人员成本说明" : "实施人员说明"}
            content={
              activeTab === "info" ? (
                <p>
                  仅含系统角色为项目经理、项目人员的账号（含离职）；离职且当月无排期时不展示投入数值。类型由项目管理员维护。
                </p>
              ) : (
                <div className="space-y-2">
                  <p>
                    按月维护人员成本。未确认月份可直接改奖金、扣罚等，点「保存」并二次确认后整月一并生效；确认前不进项目人天核算。
                  </p>
                  <p>
                    离职人员默认不列入；离职当月需关账时可用「添加离职人员」（仅本月，下月仍默认不出现）。
                  </p>
                </div>
              )
            }
          />
        </h1>
        {activeTab === "costs" && canCosts ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/cost-ledger">成本台账</Link>
          </Button>
        ) : null}
      </div>

      <PersonnelTabs
        activeTab={activeTab}
        costsHref={costsHref(year, month)}
        showInfoTab={canInfo}
        showCostsTab={canCosts}
      />

      {activeTab === "info" ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="inline-flex items-center gap-1.5 text-lg font-semibold leading-none tracking-tight">
                人员信息
                <HelpHint
                  label="人员信息说明"
                  content={
                    <div className="space-y-2">
                      <p>
                        {canInfo
                          ? "维护人员类型；展示当月投入概况。"
                          : "查看人员类型与当月投入概况（只读）。"}
                        {canCosts
                          ? " 成本明细请到「人员成本」标签编辑。"
                          : " 月成本由行政人事在「人员成本」中维护。"}
                      </p>
                      <p>
                        离职且当月无排期时投入数值显示为 —。当前 {year}年{month}月（工作日{" "}
                        {monthWorkdays} 天）。
                      </p>
                    </div>
                  }
                />
              </h3>
              <span className="text-sm text-muted-foreground">
                ({items.length} 人 · {year}年{month}月 · 公司出勤 {monthWorkdays} 天 ·
                事后关账)
              </span>
            </div>
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
                resigned: item.resigned,
                hideMonthMetrics: item.hideMonthMetrics,
              }))}
              canEditTypes={canInfo}
              showCostColumns={canCosts}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={costsHref(prev.year, prev.month)}>上一月</Link>
            </Button>
            <PersonnelMonthPicker
              year={year}
              month={month}
              maxYear={current.year}
              maxMonth={current.month}
            />
            {canGoNext ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={costsHref(next.year, next.month)}>下一月</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                下一月
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="p-6">
              <PersonnelCostBatchEditor
                key={`${year}-${month}`}
                items={costItems.map((item) => ({
                  userId: item.userId,
                  name: item.name,
                  email: item.email,
                  contributionBase: item.contributionBase,
                  baseSalary: item.baseSalary,
                  socialSecurityCompany: item.socialSecurityCompany,
                  housingFundCompany: item.housingFundCompany,
                  bonus: item.bonus,
                  penaltyAmount: item.penaltyAmount,
                  monthAdjustment: item.monthAdjustment,
                  leaveDeductionAmount: item.leaveDeductionAmount,
                  attendanceDays: item.attendanceDays,
                  attendanceDaysSystem: item.attendanceDaysSystem,
                  absenceDays: item.absenceDays,
                  changeSummary: item.changeSummary,
                  hasMonthRecord: item.hasMonthRecord,
                  monthConfirmed: item.monthConfirmed,
                  resigned: item.resigned,
                  weekEffectiveDays: item.weekEffectiveDays,
                  weekCost: item.weekCost,
                  projectCount: item.projectCount,
                  payrollSlip: item.payrollSlip,
                }))}
                year={year}
                month={month}
                monthWorkdays={monthWorkdays}
                monthFullyConfirmed={monthFullyConfirmed}
                resignedCandidates={resignedCandidates}
                titleMeta={`${costItems.length} 人 · ${year}年${month}月 · 公司出勤 ${monthWorkdays} 天${
                  costItems.length > 0
                    ? monthFullyConfirmed
                      ? " · 已确认生效"
                      : " · 待确认"
                    : ""
                }`}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
