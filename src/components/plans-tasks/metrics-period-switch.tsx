"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AnnualSubject, MetricsPeriod } from "@/lib/plans-tasks/metrics-scope";

type SalesUser = { id: string; name: string };

function buildPlansTasksUrl(params: {
  period: MetricsPeriod;
  subject?: AnnualSubject;
  monthlyUserId?: string;
}) {
  const search = new URLSearchParams(window.location.search);
  search.set("tab", "dashboard");
  search.set("period", params.period);
  if (params.period === "annual") {
    if (params.subject && params.subject !== "team") {
      search.set("subject", params.subject);
    } else {
      search.delete("subject");
      search.delete("userId");
    }
  }
  if (params.monthlyUserId) {
    search.set("monthlyUserId", params.monthlyUserId);
  }
  return `/plans-tasks?${search.toString()}`;
}

export function MetricsPeriodSwitch({ period }: { period: MetricsPeriod }) {
  const router = useRouter();

  function switchPeriod(next: MetricsPeriod) {
    const search = new URLSearchParams(window.location.search);
    const subject = (search.get("subject") ?? search.get("userId") ?? "team") as AnnualSubject;
    const monthlyUserId = search.get("monthlyUserId") ?? undefined;
    router.replace(
      buildPlansTasksUrl({
        period: next,
        subject: next === "annual" ? subject : undefined,
        monthlyUserId,
      }),
      { scroll: false }
    );
  }

  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-1">
      <button
        type="button"
        onClick={() => switchPeriod("annual")}
        className={cn(
          "rounded-md px-4 py-2 text-sm font-medium transition-colors",
          period === "annual"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        年度
      </button>
      <button
        type="button"
        onClick={() => switchPeriod("monthly")}
        className={cn(
          "rounded-md px-4 py-2 text-sm font-medium transition-colors",
          period === "monthly"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        月度
      </button>
    </div>
  );
}

export function AnnualSubjectSelect({
  value,
  salesUsers,
  onChange,
}: {
  value: AnnualSubject;
  salesUsers: SalesUser[];
  onChange: (subject: AnnualSubject) => void;
}) {
  return (
    <div className="space-y-2 min-w-[160px]">
      <label htmlFor="annual-subject" className="text-sm font-medium leading-none">
        查看对象
      </label>
      <select
        id="annual-subject"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="team">团队汇总</option>
        {salesUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </div>
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
  label: string;
  value: string;
  salesUsers: SalesUser[];
  onChange: (userId: string) => void;
}) {
  return (
    <div className="space-y-2 max-w-xs">
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {salesUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function useMetricsNavigation() {
  const router = useRouter();

  function navigateAnnualSubject(subject: AnnualSubject) {
    const search = new URLSearchParams(window.location.search);
    const monthlyUserId = search.get("monthlyUserId") ?? undefined;
    router.replace(
      buildPlansTasksUrl({ period: "annual", subject, monthlyUserId }),
      { scroll: false }
    );
  }

  function navigateMonthlyUser(monthlyUserId: string) {
    router.replace(buildPlansTasksUrl({ period: "monthly", monthlyUserId }), { scroll: false });
  }

  return { navigateAnnualSubject, navigateMonthlyUser };
}
