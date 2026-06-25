import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { buildDailyReportDayHref } from "@/lib/sales-log/daily-report-day";
import { formatDailyReportDate, getDailyReportDetail } from "@/lib/sales-log/daily-reports";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DailyReportDetailPage({ params }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const { id } = await params;

  const report = await getDailyReportDetail(id, session.user.role, session.user.id);
  if (!report) notFound();

  redirect(
    buildDailyReportDayHref({
      date: formatDailyReportDate(report.logDate),
      userId: report.user.id,
    })
  );
}
