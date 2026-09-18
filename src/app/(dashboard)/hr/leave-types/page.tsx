import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { listAllLeaveTypes } from "@/lib/personnel/leave-types";
import { LeaveTypesAdminPanel } from "@/components/hr/leave-types-admin-panel";

export default async function HrLeaveTypesPage() {
  await requireRole(["HR", "ADMIN"]);
  const types = await listAllLeaveTypes();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">假种与扣款规则</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            计薪系数 0～1（1=全薪、0=全扣）。关账时按「参考日薪 × (1−系数)」汇总请假扣款；可分别控制是否计缺勤、是否免日报。
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/hr">返回工作台</Link>
        </Button>
      </div>

      <LeaveTypesAdminPanel
        types={types.map((t) => ({
          id: t.id,
          key: t.key,
          label: t.label,
          payFactor: t.payFactor,
          countsAsAbsence: t.countsAsAbsence,
          exemptDailyReport: t.exemptDailyReport,
          enabled: t.enabled,
          sortOrder: t.sortOrder,
        }))}
      />
    </div>
  );
}
