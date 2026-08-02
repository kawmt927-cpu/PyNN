import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import {
  listNotificationsForUser,
  ensureRejectedContractNotificationsForUser,
  NOTIFICATION_TYPES,
  countUnreadNotifications,
} from "@/lib/notifications/app-notifications";
import { mapDesktopPathToMobile } from "@/lib/mobile/device";
import { MobileInboxRow } from "@/components/mobile/mobile-inbox-row";
import { MarkAllNotificationsReadButton } from "@/components/notifications/mark-all-notifications-read-button";
import { markAllAsRead } from "@/app/(dashboard)/notifications/actions";

function formatWhen(value: Date) {
  return format(value, "M月d日 HH:mm");
}

function badgeForType(type: string) {
  switch (type) {
    case "FOLLOW_UP_CREATED":
      return "往来";
    case "DAILY_LOG_SUBMITTED":
      return "日报";
    case NOTIFICATION_TYPES.DAILY_REPORT_REMIND:
    case NOTIFICATION_TYPES.DAILY_REPORT_LATE:
      return "日报";
    case NOTIFICATION_TYPES.CONTRACT_REJECTED:
      return "合同";
    case NOTIFICATION_TYPES.WEEKLY_ASSIGNMENT_ASSIGNED:
    case NOTIFICATION_TYPES.GENERAL_ASSIGNMENT_PENDING_CONFIRM:
      return "任务";
    case NOTIFICATION_TYPES.CHECK_IN_LOCATION_IP_MISMATCH:
      return "打卡";
    default:
      return "通知";
  }
}

/** 站内/企微通知落地：桌面路径映射到手机端 */
function toMobileHref(linkHref: string | null | undefined): string {
  if (!linkHref?.trim()) return "/mobile/activity";
  let path = linkHref.trim();
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const url = new URL(path);
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return "/mobile/activity";
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const qIndex = path.indexOf("?");
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const search = qIndex >= 0 ? path.slice(qIndex) : "";
  return mapDesktopPathToMobile(pathname, search) ?? path;
}

export default async function MobileInboxPage() {
  const session = await requireRole(SALES_MOBILE_ROLES);
  await ensureRejectedContractNotificationsForUser(session.user.id);
  const [receipts, unreadCount] = await Promise.all([
    listNotificationsForUser(session.user.id, 80),
    countUnreadNotifications(session.user.id),
  ]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">消息</h1>
            <p className="text-xs text-muted-foreground">
              往来、日报与系统通知
              {unreadCount > 0 ? ` · ${unreadCount} 条未读` : ""}
            </p>
          </div>
          {unreadCount > 0 ? (
            <MarkAllNotificationsReadButton action={markAllAsRead} />
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4 pb-6">
        {receipts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            暂无消息。提交往来或日报后，相关提醒会出现在这里。
          </p>
        ) : (
          receipts.map((row) => (
            <MobileInboxRow
              key={row.id}
              receiptId={row.id}
              href={toMobileHref(row.notification.linkHref)}
              unread={!row.readAt}
              title={row.notification.title}
              body={row.notification.body}
              when={formatWhen(row.notification.createdAt)}
              badge={badgeForType(row.notification.type)}
            />
          ))
        )}
      </div>
    </div>
  );
}
