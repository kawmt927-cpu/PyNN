import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listTodayWorkRecords } from "@/lib/plans-tasks/today-work-records";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  userId: string;
};

export async function TodayWorkRecordsPanel({ role, userId }: Props) {
  const records = await listTodayWorkRecords(role, userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">今日工作记录</CardTitle>
        <p className="text-sm text-muted-foreground">今日全部打卡与往来，按时间倒序</p>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">今日暂无工作记录。</p>
        ) : (
          <ul className="space-y-3">
            {records.map((row) => (
              <li key={`${row.kind}-${row.id}`} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        row.kind === "check_in"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      }`}
                    >
                      {row.kind === "check_in" ? "打卡" : "往来"}
                    </span>
                    {row.contactName ? (
                      <span className="font-medium">{row.contactName}</span>
                    ) : null}
                    {row.customerName && row.customerId ? (
                      <Link href={`/customers/${row.customerId}`} className="text-primary hover:underline">
                        {row.customerName}
                      </Link>
                    ) : row.customerName ? (
                      <span>{row.customerName}</span>
                    ) : (
                      <span className="text-muted-foreground">无客户</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{format(row.at, "HH:mm")}</span>
                </div>
                <p className="mt-2 line-clamp-2">{row.summary}</p>
                {row.kind === "check_in" ? (
                  <p
                    className={`mt-1 text-xs ${row.needsAction ? "text-orange-600" : "text-green-600"}`}
                  >
                    {row.statusLabel}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.methodLabel}
                    {row.opportunityTitle ? ` · 商机：${row.opportunityTitle}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
