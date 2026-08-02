import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listNotificationsForUser,
  ensureRejectedContractNotificationsForUser,
  NOTIFICATION_ACCESS_ROLES,
  NOTIFICATION_TYPES,
} from "@/lib/notifications/app-notifications";
import { markAllAsRead, markNotificationAsRead } from "@/app/(dashboard)/notifications/actions";
import { MarkNotificationReadButton } from "@/components/notifications/mark-notification-read-button";
import { MarkAllNotificationsReadButton } from "@/components/notifications/mark-all-notifications-read-button";
import { NotificationAssignmentConfirmActions } from "@/components/notifications/notification-assignment-confirm-actions";
import { NotificationRejectedContractActions } from "@/components/notifications/notification-rejected-contract-actions";

function formatWhen(value: Date) {
  return value.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseMeta(metaJson: string | null): Record<string, unknown> | null {
  if (!metaJson) return null;
  try {
    return JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default async function NotificationsPage() {
  const session = await requireRole(NOTIFICATION_ACCESS_ROLES);
  await ensureRejectedContractNotificationsForUser(session.user.id);
  const receipts = await listNotificationsForUser(session.user.id, 100);
  const unreadCount = receipts.filter((row) => !row.readAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">通知</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            打卡异常、任务指派、日报催交/迟交、合同驳回、普通任务待确认等提醒
            {unreadCount > 0 ? ` · ${unreadCount} 条未读` : ""}
          </p>
        </div>
        {unreadCount > 0 ? <MarkAllNotificationsReadButton action={markAllAsRead} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">通知列表</CardTitle>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无通知</p>
          ) : (
            <ul className="space-y-4">
              {receipts.map((row) => {
                const unread = !row.readAt;
                const meta = parseMeta(row.notification.metaJson);
                const assignmentId =
                  row.notification.type ===
                    NOTIFICATION_TYPES.GENERAL_ASSIGNMENT_PENDING_CONFIRM &&
                  typeof meta?.assignmentId === "string"
                    ? meta.assignmentId
                    : null;
                const rejectedContractId =
                  row.notification.type === NOTIFICATION_TYPES.CONTRACT_REJECTED &&
                  typeof meta?.contractId === "string"
                    ? meta.contractId
                    : null;
                const hasInlineActions = Boolean(assignmentId || rejectedContractId);
                return (
                  <li
                    key={row.id}
                    className={`rounded-md border p-4 ${unread ? "border-amber-300/70 bg-amber-50/40" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{row.notification.title}</p>
                          {unread ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                              未读
                            </span>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {row.notification.body}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatWhen(row.notification.createdAt)}
                        </p>
                        {assignmentId ? (
                          <NotificationAssignmentConfirmActions
                            assignmentId={assignmentId}
                            receiptId={row.id}
                            unread={unread}
                          />
                        ) : null}
                        {rejectedContractId ? (
                          <NotificationRejectedContractActions
                            contractId={rejectedContractId}
                            receiptId={row.id}
                            unread={unread}
                          />
                        ) : null}
                        {row.notification.linkHref && !rejectedContractId ? (
                          <Button asChild variant="link" className="h-auto px-0 text-sm">
                            <Link href={row.notification.linkHref}>
                              {row.notification.type ===
                              NOTIFICATION_TYPES.WEEKLY_ASSIGNMENT_ASSIGNED
                                ? "前往计划与任务查看"
                                : row.notification.type ===
                                      NOTIFICATION_TYPES.DAILY_REPORT_REMIND ||
                                    row.notification.type ===
                                      NOTIFICATION_TYPES.DAILY_REPORT_LATE
                                  ? row.notification.type ===
                                    NOTIFICATION_TYPES.DAILY_REPORT_LATE
                                    ? "前往补录日报"
                                    : "前往填写日报"
                                  : "查看相关页面"}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                      {unread && !hasInlineActions ? (
                        <MarkNotificationReadButton
                          receiptId={row.id}
                          action={markNotificationAsRead}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
