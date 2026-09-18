import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { listEnabledLeaveTypes } from "@/lib/personnel/leave-types";
import { listLeavesForMonth } from "@/lib/personnel/leaves";
import { LeaveAdminPanel } from "@/components/hr/leave-admin-panel";
import { shiftYearMonth } from "@/lib/personnel/daily-rate";

type Props = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function HrLeavesPage({ searchParams }: Props) {
  await requireRole(["HR", "ADMIN"]);
  const query = await searchParams;
  const now = new Date();
  const prev = shiftYearMonth(now.getFullYear(), now.getMonth() + 1, -1);
  const year = Number(query.year) || prev.year;
  const month = Number(query.month) || prev.month;

  const [types, leaves, users] = await Promise.all([
    listEnabledLeaveTypes(),
    listLeavesForMonth(year, month),
    prisma.user.findMany({
      where: {
        OR: [
          { personnelProfile: { enabled: true } },
          { role: { in: ["SALES", "SALES_MANAGER", "PROJECT_STAFF", "PROJECT_MANAGER"] } },
        ],
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">请假登记</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            手工登记优先于企微同步。事假/病假等按假种计薪系数，在人事成本关账时自动汇总扣款；请假日免交日报。
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/hr">返回工作台</Link>
        </Button>
      </div>

      <LeaveAdminPanel
        year={year}
        month={month}
        types={types.map((t) => ({
          id: t.id,
          key: t.key,
          label: t.label,
          payFactor: t.payFactor,
        }))}
        users={users}
        leaves={leaves.map((l) => ({
          id: l.id,
          userName: l.user.name,
          typeLabel: l.leaveType.label,
          payFactor: l.leaveType.payFactor,
          startDayKey: l.startDayKey,
          endDayKey: l.endDayKey,
          source: l.source,
          note: l.note,
        }))}
      />
    </div>
  );
}
