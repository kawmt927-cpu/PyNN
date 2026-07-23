"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AnnualSubject, MetricsPeriod } from "@/lib/plans-tasks/metrics-scope";
import { metricsYearOptions } from "@/lib/plans-tasks/metrics-scope";

type SalesUser = { id: string; name: string };

function buildMetricsNavUrl(params: {
  period: MetricsPeriod;
  subject?: AnnualSubject;
  monthlyUserId?: string;
  year?: number;
  month?: number;
}) {
  const path = window.location.pathname;
  const search = new URLSearchParams(window.location.search);
  if (path.startsWith("/plans-tasks")) {
    search.set("tab", "dashboard");
  }
  search.set("period", params.period);
  if (params.period === "annual") {
    if (params.subject && params.subject !== "team") {
      search.set("subject", params.subject);
    } else {
      search.delete("subject");
      search.delete("userId");
    }
    search.delete("month");
  }
  if (params.monthlyUserId) {
    search.set("monthlyUserId", params.monthlyUserId);
  }
  if (params.year != null) {
    search.set("year", String(params.year));
  }
  if (params.period === "monthly" && params.month != null) {
    search.set("month", String(params.month));
  }
  return `${path}?${search.toString()}`;
}

function readYearMonthFromSearch(search: URLSearchParams) {
  const year = Number.parseInt(search.get("year") ?? "", 10);
  const month = Number.parseInt(search.get("month") ?? "", 10);
  return {
    year: Number.isFinite(year) ? year : undefined,
    month: Number.isFinite(month) ? month : undefined,
  };
}

export function MetricsPeriodSwitch({ period }: { period: MetricsPeriod }) {
  const router = useRouter();

  function switchPeriod(next: MetricsPeriod) {
    const search = new URLSearchParams(window.location.search);
    const subject = (search.get("subject") ?? search.get("userId") ?? "team") as AnnualSubject;
    const monthlyUserId = search.get("monthlyUserId") ?? undefined;
    const year = Number.parseInt(search.get("year") ?? "", 10);
    const month = Number.parseInt(search.get("month") ?? "", 10);
    router.replace(
      buildMetricsNavUrl({
        period: next,
        subject: next === "annual" ? subject : undefined,
        monthlyUserId,
        year: Number.isFinite(year) ? year : undefined,
        month: Number.isFinite(month) ? month : undefined,
      }),
      { scroll: false }
    );
  }

  return (
    <div className="inline-flex h-10 items-center rounded-lg border bg-muted/40 p-1">
      <button
        type="button"
        onClick={() => switchPeriod("monthly")}
        className={cn(
          "inline-flex h-8 items-center rounded-md px-4 text-sm font-medium transition-colors",
          period === "monthly"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        月度
      </button>
      <button
        type="button"
        onClick={() => switchPeriod("annual")}
        className={cn(
          "inline-flex h-8 items-center rounded-md px-4 text-sm font-medium transition-colors",
          period === "annual"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        年度
      </button>
    </div>
  );
}

const MONTH_LABELS = [
  "1 月",
  "2 月",
  "3 月",
  "4 月",
  "5 月",
  "6 月",
  "7 月",
  "8 月",
  "9 月",
  "10 月",
  "11 月",
  "12 月",
];

export function MetricsTimeSelect({
  period,
  year,
  month,
  nowYear,
  nowMonth,
  recentYearsOnly = false,
}: {
  period: MetricsPeriod;
  year: number;
  month: number;
  nowYear: number;
  nowMonth: number;
  /** 手机端：仅今年与去年 */
  recentYearsOnly?: boolean;
}) {
  const router = useRouter();
  const yearOptions = recentYearsOnly
    ? [nowYear, nowYear - 1]
    : metricsYearOptions(new Date(nowYear, nowMonth - 1, 1));
  const effectiveYear = yearOptions.includes(year) ? year : nowYear;

  function navigate(nextYear: number, nextMonth: number) {
    const path = window.location.pathname;
    const search = new URLSearchParams(window.location.search);
    if (path.startsWith("/plans-tasks")) {
      search.set("tab", "dashboard");
    }
    search.set("year", String(nextYear));
    if (period === "monthly") {
      search.set("month", String(nextMonth));
    } else {
      search.delete("month");
    }
    router.replace(`${path}?${search.toString()}`, { scroll: false });
  }

  function handleYearChange(nextYear: number) {
    let nextMonth = month;
    if (period === "monthly" && nextYear === nowYear && nextMonth > nowMonth) {
      nextMonth = nowMonth;
    }
    navigate(nextYear, nextMonth);
  }

  const monthOptions =
    period === "monthly"
      ? MONTH_LABELS.map((label, index) => {
          const value = index + 1;
          const disabled = effectiveYear === nowYear && value > nowMonth;
          return { value, label, disabled };
        })
      : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        id="metrics-year"
        value={effectiveYear}
        aria-label="年份"
        onChange={(e) => handleYearChange(Number.parseInt(e.target.value, 10))}
        className="flex h-10 min-w-[6.5rem] rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {yearOptions.map((option) => (
          <option key={option} value={option}>
            {option} 年
          </option>
        ))}
      </select>
      {period === "monthly" ? (
        <select
          id="metrics-month"
          value={month}
          aria-label="月份"
          onChange={(e) => navigate(effectiveYear, Number.parseInt(e.target.value, 10))}
          className="flex h-10 min-w-[5.5rem] rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

/** 销售个人视图：同时影响月度 KPI 与年度指标年份 */
export function SalesMetricsTimeSelect({
  year,
  month,
  nowYear,
  nowMonth,
  recentYearsOnly = false,
}: {
  year: number;
  month: number;
  nowYear: number;
  nowMonth: number;
  recentYearsOnly?: boolean;
}) {
  return (
    <MetricsTimeSelect
      period="monthly"
      year={year}
      month={month}
      nowYear={nowYear}
      nowMonth={nowMonth}
      recentYearsOnly={recentYearsOnly}
    />
  );
}

export function AnnualSubjectSelect({
  value,
  regularSalesUsers,
  showOthers = false,
  onChange,
}: {
  value: AnnualSubject;
  /** 仅普通销售（逐人查看） */
  regularSalesUsers: SalesUser[];
  /** 是否显示「其他」（非普通销售合计） */
  showOthers?: boolean;
  onChange: (subject: AnnualSubject) => void;
}) {
  return (
    <select
      id="annual-subject"
      aria-label="查看对象"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="team">团队汇总</option>
      {regularSalesUsers.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
      {showOthers ? <option value="others">其他</option> : null}
    </select>
  );
}

export function PersonSelect({
  id,
  label,
  value,
  salesUsers,
  onChange,
}: {
  id: string;
  /** 可见标签；不传则仅用 aria-label */
  label?: string;
  value: string;
  salesUsers: SalesUser[];
  onChange: (userId: string) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label ?? "查看销售"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 min-w-[160px] max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      {salesUsers.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
    </select>
  );
}

export function useMetricsNavigation() {
  const router = useRouter();

  function navigateAnnualSubject(subject: AnnualSubject) {
    const search = new URLSearchParams(window.location.search);
    const monthlyUserId = search.get("monthlyUserId") ?? undefined;
    const { year, month } = readYearMonthFromSearch(search);
    router.replace(
      buildMetricsNavUrl({ period: "annual", subject, monthlyUserId, year, month }),
      { scroll: false }
    );
  }

  function navigateMonthlyUser(monthlyUserId: string) {
    const search = new URLSearchParams(window.location.search);
    const { year, month } = readYearMonthFromSearch(search);
    router.replace(
      buildMetricsNavUrl({ period: "monthly", monthlyUserId, year, month }),
      { scroll: false }
    );
  }

  return { navigateAnnualSubject, navigateMonthlyUser };
}
