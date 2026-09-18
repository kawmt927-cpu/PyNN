import { redirect } from "next/navigation";

/** 兼容入口：转发到 /admin/sales-monthly */
export default async function DailyReportsMonthlyRedirect({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const q = await searchParams;
  const params = new URLSearchParams();
  if (q.year) params.set("year", q.year);
  if (q.month) params.set("month", q.month);
  const qs = params.toString();
  redirect(`/admin/sales-monthly${qs ? `?${qs}` : ""}`);
}
