import Link from "next/link";
import { format } from "date-fns";
import { canManageCustomerOwner, listCustomerAssignableUsers } from "@/lib/customers/access";
import { loadInteractionFormOptions } from "@/lib/config-options";
import {
  listMyTodayCheckIns,
  checkInStatusLabel,
  checkInRequiresFollowUp,
} from "@/lib/sales-log/check-in";
import { listTodayFollowUps } from "@/lib/sales-log/today-follow-ups";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { CheckInForm, ManualLogForm } from "@/components/sales-log/daily-work-forms";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { CheckInDeleteButton } from "@/components/sales-log/check-in-delete-button";
import { CheckInCompleteButton } from "@/components/sales-log/check-in-complete-button";
import type { SalesDailyLogStatus, UserRole } from "@prisma/client";

type SectionProps = {
  role: UserRole;
  userId: string;
  mapKey: string | null;
  geocodeReady: boolean;
};

export async function CheckInSection({ role, userId, mapKey, geocodeReady }: SectionProps) {
  const [checkIns, interactionFormOptions, salesUsers] = await Promise.all([
    listMyTodayCheckIns(userId),
    loadInteractionFormOptions(),
    canManageCustomerOwner(role) ? listCustomerAssignableUsers() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <CheckInForm
        mapKey={mapKey}
        geocodeReady={geocodeReady}
        customerFormOptions={{
          ...interactionFormOptions,
          showOwnerSelect: canManageCustomerOwner(role),
          salesUsers,
        }}
      />
      <div className="overflow-x-auto">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">今日打卡记录</p>
          <p className="text-xs text-muted-foreground">仅显示本人今日记录</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-center text-muted-foreground">
              <th className="px-2 pb-2">时间</th>
              <th className="whitespace-nowrap px-2 pb-2">联系人</th>
              <th className="px-2 pb-2">客户</th>
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
                    {row.contact?.name ?? "—"}
                  </td>
                  <td className="px-2 py-3">
                    {row.customer ? (
                      <Link href={`/customers/${row.customer.id}`} className="hover:underline">
                        {row.customer.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">无客户</span>
                    )}
                  </td>
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
                        checkInRequiresFollowUp(row) ? "text-orange-600" : "text-green-600"
                      }
                    >
                      {checkInStatusLabel(row)}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {checkInRequiresFollowUp(row) && row.customer ? (
                        <CheckInCompleteButton
                          checkInId={row.id}
                          customerId={row.customer.id}
                          customerName={row.customer.name}
                          currentCustomerGrade={row.customer.customerGrade}
                          contactId={row.contact?.id}
                          stageOptions={interactionFormOptions.stageOptions}
                          gradeOptions={interactionFormOptions.gradeOptions}
                        />
                      ) : null}
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
    </div>
  );
}

type DailyReportSectionProps = {
  role: UserRole;
  userId: string;
  dailyLogStatus: SalesDailyLogStatus | null;
  pendingCheckIns: number;
};

export async function DailyReportSection({
  role,
  userId,
  dailyLogStatus,
  pendingCheckIns,
}: DailyReportSectionProps) {
  const [followUps, interactionFormOptions] = await Promise.all([
    listTodayFollowUps(role, userId),
    loadInteractionFormOptions(),
  ]);

  return (
    <div className="space-y-6">
      {(dailyLogStatus === "SUBMITTED" || dailyLogStatus === "RISK_SUBMITTED") && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          今日日报已提交。如需补充，可继续录入往来或与 AI 对话。
        </p>
      )}
      {dailyLogStatus !== "SUBMITTED" &&
        dailyLogStatus !== "RISK_SUBMITTED" &&
        pendingCheckIns > 0 && (
          <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
            今日有 {pendingCheckIns} 条打卡待完善，收工后请与{" "}
            <Link href="/mobile/log" className="font-medium underline">
              AI 助理
            </Link>{" "}
            对话补全往来内容。
          </p>
        )}

      <ManualLogForm
        formOptions={{
          stageOptions: interactionFormOptions.stageOptions,
          gradeOptions: interactionFormOptions.gradeOptions,
        }}
      />
      <div className="overflow-x-auto">
        <div className="mb-2">
          <p className="text-sm font-medium">今日往来记录</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">时间</th>
              <th className="pb-2 pr-4">联系人</th>
              <th className="pb-2 pr-4">客户</th>
              <th className="pb-2 pr-4">方式</th>
              <th className="pb-2 pr-4">内容</th>
              <th className="pb-2 pr-4">商机</th>
              <th className="pb-2 pr-4">下次计划</th>
              <th className="pb-2">销售</th>
            </tr>
          </thead>
          <tbody>
            {followUps.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-muted-foreground">
                  今日暂无往来记录
                </td>
              </tr>
            ) : (
              followUps.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="whitespace-nowrap py-3 pr-4">
                    {format(row.followUpAt, "HH:mm")}
                  </td>
                  <td className="py-3 pr-4 font-medium">{row.contact?.name ?? "—"}</td>
                  <td className="py-3 pr-4">
                    <Link href={`/customers/${row.customer.id}`} className="hover:underline">
                      {row.customer.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{salesLogMethodLabel(row.method)}</td>
                  <td className="max-w-xs truncate py-3 pr-4">{row.content}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {row.opportunity ? (
                      <Link href={`/opportunities/${row.opportunity.id}`} className="text-primary hover:underline">
                        {row.opportunity.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {row.nextFollowUpAt ? (
                      <>
                        {row.nextFollowUpMethod
                          ? `${FOLLOW_UP_METHOD_LABELS[row.nextFollowUpMethod]} · `
                          : ""}
                        {format(row.nextFollowUpAt, "MM-dd HH:mm")}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3">{row.user.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
