import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { getEffectiveAmapConfig } from "@/lib/amap/config";
import { canManageCustomerOwner, listCustomerAssignableUsers } from "@/lib/customers/access";
import { loadInteractionFormOptions } from "@/lib/config-options";
import {
  listMyTodayCheckIns,
  checkInStatusLabel,
  checkInRequiresFollowUp,
} from "@/lib/sales-log/check-in";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { CheckInForm } from "@/components/sales-log/daily-work-forms";
import { CheckInDeleteButton } from "@/components/sales-log/check-in-delete-button";
import { CheckInCompleteButton } from "@/components/sales-log/check-in-complete-button";
import { cn } from "@/lib/utils";

export default async function MobileCheckInPage() {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const role = session.user.role;
  const userId = session.user.id;

  const [checkIns, interactionFormOptions, salesUsers, amap] = await Promise.all([
    listMyTodayCheckIns(userId),
    loadInteractionFormOptions(),
    canManageCustomerOwner(role) ? listCustomerAssignableUsers() : Promise.resolve([]),
    getEffectiveAmapConfig(),
  ]);

  const mapKey = amap.jsKey;
  const geocodeReady = Boolean(amap.webServiceKey);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">往来打卡</h1>
        <p className="text-xs text-muted-foreground">定位签到并记录拜访；今日记录见下方</p>
      </header>

      <div id="mobile-check-in-guide" className="shrink-0" />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 pb-8">
        {!geocodeReady && (
          <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200">
            地址解析未配置。管理员可在电脑端「系统配置 → 打卡定位」填写高德 Key；仍可先打卡。
          </p>
        )}

        <CheckInForm
          mapKey={mapKey}
          geocodeReady={geocodeReady}
          guided
          guidePortalId="mobile-check-in-guide"
          customerFormOptions={{
            ...interactionFormOptions,
            showOwnerSelect: canManageCustomerOwner(role),
            salesUsers,
          }}
        />

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">今日打卡</h2>
            <span className="text-xs text-muted-foreground">{checkIns.length} 条</span>
          </div>

          {checkIns.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              今日暂无打卡记录
            </p>
          ) : (
            <ul className="space-y-3">
              {checkIns.map((row) => {
                const needsFollowUp = checkInRequiresFollowUp(row);
                return (
                  <li key={row.id} className="rounded-xl border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {row.customer ? (
                            <Link
                              href={`/mobile/customers/${row.customer.id}`}
                              className="hover:underline"
                            >
                              {row.customer.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">无客户</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {format(row.checkedInAt, "HH:mm")}
                          {row.contact?.name ? ` · ${row.contact.name}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          needsFollowUp ? "text-orange-600" : "text-emerald-600"
                        )}
                      >
                        {checkInStatusLabel(row)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {formatCheckInLocation(row)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {needsFollowUp && row.customer ? (
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
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
