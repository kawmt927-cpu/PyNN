import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { CompanyCalendarAdmin } from "@/components/hr/company-calendar-admin";
import { ensureCompanyCalendarCache } from "@/lib/calendar/cn-daily-report-days";
import { seedBuiltinCompanyCalendar } from "@/lib/calendar/company-calendar-sync";

type Props = {
  searchParams: Promise<{ year?: string }>;
};

export default async function HrCalendarPage({ searchParams }: Props) {
  await requireRole(["HR", "ADMIN"]);
  const query = await searchParams;
  const year = Number(query.year) || new Date().getFullYear();

  await seedBuiltinCompanyCalendar();
  await ensureCompanyCalendarCache();

  const [days, sync] = await Promise.all([
    prisma.companyCalendarDay.findMany({
      where: { year },
      orderBy: { dayKey: "asc" },
    }),
    prisma.companyCalendarYearSync.findUnique({ where: { year } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">公司放假日历</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            自动同步国办安排，可手工改日（手工优先，同步不会覆盖）。影响日报考核与出勤统计。
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/hr">返回工作台</Link>
        </Button>
      </div>

      <CompanyCalendarAdmin
        year={year}
        days={days.map((d) => ({
          dayKey: d.dayKey,
          kind: d.kind,
          name: d.name,
          source: d.source,
        }))}
        syncStatus={sync?.status ?? null}
        syncMessage={sync?.message ?? null}
        syncDayCount={sync?.dayCount ?? 0}
      />
    </div>
  );
}
