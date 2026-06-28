import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canViewAllDailyReports } from "@/lib/sales-log/access";
import {
  listDailyReportMarkedDates,
  resolveDailyReportSubjectUser,
} from "@/lib/sales-log/daily-report-day";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const requestedUserId = searchParams.get("userId")?.trim() ?? "";

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const subjectUser = await resolveDailyReportSubjectUser(
    session.user.role,
    session.user.id,
    requestedUserId
  );
  if (!subjectUser) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  if (!canViewAllDailyReports(session.user.role) && subjectUser.id !== session.user.id) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const dates = await listDailyReportMarkedDates(subjectUser.id, year, month);
  return NextResponse.json({ dates });
}
