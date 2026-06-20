import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEffectiveAmapConfig } from "@/lib/amap/config";
import { canManageCustomerOwner } from "@/lib/customers/access";
import { loadCustomerFormOptions } from "@/lib/config-options";
import { prisma } from "@/lib/prisma";
import { listTodayCheckIns, checkInStatusLabel, checkInRequiresFollowUp } from "@/lib/sales-log/check-in";
import { listTodayFollowUps } from "@/lib/sales-log/today-follow-ups";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { getTodayDailyLogForUser } from "@/lib/sales-log/daily-log";
import {
  AiLogLink,
  CheckInForm,
  ManualLogForm,
} from "@/components/sales-log/daily-work-forms";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { CheckInDeleteButton } from "@/components/sales-log/check-in-delete-button";

export default async function SalesLogPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  const [checkIns, followUps, dailyLog, amap, customerFormOptions, salesUsers] = await Promise.all([
    listTodayCheckIns(session.user.role, session.user.id),
    listTodayFollowUps(session.user.role, session.user.id),
    getTodayDailyLogForUser(session.user.id),
    getEffectiveAmapConfig(),
    loadCustomerFormOptions(),
    canManageCustomerOwner(session.user.role)
      ? prisma.user.findMany({
          where: { role: { in: ["SALES", "SALES_MANAGER"] } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const pendingCount = checkIns.filter((row) => checkInRequiresFollowUp(row)).length;
  const mapKey = amap.jsKey;
  const amapConfigured = Boolean(amap.webServiceKey);
  const amapMapReady = Boolean(amap.jsKey);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">外勤日志</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            白天使用无客户打卡或往来打卡记录外勤；电话/微信等可手动录入；收工后通过 AI 助理补全待完善往来并提交日报。
          </p>
        </div>
        <AiLogLink />
      </div>

      {dailyLog?.status === "SUBMITTED" || dailyLog?.status === "RISK_SUBMITTED" ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          今日日报已提交。如需补充，可继续手动录入或与 AI 对话。
        </p>
      ) : pendingCount > 0 ? (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
          今日有 {pendingCount} 条打卡待完善，收工后请与{" "}
          <Link href="/mobile/log" className="font-medium underline">
            AI 助理
          </Link>{" "}
          对话补全往来内容。
        </p>
      ) : null}

      {!amapConfigured && (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
          打卡地址解析尚未配置。请管理员前往{" "}
          <Link href="/admin/settings?tab=amap" className="font-medium underline">
            系统配置 → 打卡定位
          </Link>{" "}
          填写高德 Web 服务 Key。
        </p>
      )}
      {amapConfigured && !amapMapReady && (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
          地址解析已就绪，但地图展示 Key 未配置。管理员可在{" "}
          <Link href="/admin/settings?tab=amap" className="font-medium underline">
            系统配置 → 打卡定位
          </Link>{" "}
          补充 JS API Key 以显示地图。
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>定位打卡</CardTitle>
          <p className="text-sm text-muted-foreground">
            无客户打卡仅记录定位；往来打卡可仅打卡后由 AI 补全，也可当场录入往来。找不到客户时可新增。
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <CheckInForm
            mapKey={mapKey}
            customerFormOptions={{
              ...customerFormOptions,
              showOwnerSelect: canManageCustomerOwner(session.user.role),
              salesUsers,
            }}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-center text-muted-foreground">
                  <th className="px-2 pb-2">时间</th>
                  <th className="px-2 pb-2">客户</th>
                  <th className="whitespace-nowrap px-2 pb-2">联系人</th>
                  <th className="px-2 pb-2">地点</th>
                  <th className="px-2 pb-2">销售</th>
                  <th className="px-2 pb-2">状态</th>
                  <th className="px-2 pb-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {checkIns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      今日暂无打卡记录
                    </td>
                  </tr>
                ) : (
                  checkIns.map((row) => (
                    <tr key={row.id} className="border-b text-center">
                      <td className="whitespace-nowrap px-2 py-3">
                        {format(row.checkedInAt, "HH:mm")}
                      </td>
                      <td className="px-2 py-3 font-medium">
                        {row.customer ? (
                          <Link href={`/customers/${row.customer.id}`} className="hover:underline">
                            {row.customer.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">无客户</span>
                        )}
                      </td>
                      <td className="px-2 py-3">{row.contact?.name ?? "—"}</td>
                      <td
                        className="max-w-[240px] truncate px-2 py-3"
                        title={formatCheckInLocation(row)}
                      >
                        {formatCheckInLocation(row)}
                      </td>
                      <td className="px-2 py-3">{row.user.name}</td>
                      <td className="px-2 py-3">
                        <span
                          className={
                            checkInRequiresFollowUp(row)
                              ? "text-orange-600"
                              : "text-green-600"
                          }
                        >
                          {checkInStatusLabel(row)}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-center">
                          <CheckInDeleteButton
                            checkInId={row.id}
                            hasFollowUp={Boolean(row.followUpId)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>手动往来记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ManualLogForm />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">时间</th>
                  <th className="pb-2 pr-4">客户</th>
                  <th className="pb-2 pr-4">方式</th>
                  <th className="pb-2 pr-4">内容</th>
                  <th className="pb-2 pr-4">来源</th>
                  <th className="pb-2">销售</th>
                </tr>
              </thead>
              <tbody>
                {followUps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-muted-foreground">
                      今日暂无往来记录
                    </td>
                  </tr>
                ) : (
                  followUps.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {format(row.followUpAt, "HH:mm")}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        <Link href={`/customers/${row.customer.id}`} className="hover:underline">
                          {row.customer.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{salesLogMethodLabel(row.method)}</td>
                      <td className="py-3 pr-4 max-w-xs truncate">{row.content}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {row.salesCheckIn ? "打卡完善" : "手动/AI"}
                      </td>
                      <td className="py-3">{row.user.name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
