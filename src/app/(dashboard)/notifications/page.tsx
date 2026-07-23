import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listNotificationsForUser } from "@/lib/notifications/app-notifications";
import { markAllAsRead, markNotificationAsRead } from "@/app/(dashboard)/notifications/actions";
import { MarkNotificationReadButton } from "@/components/notifications/mark-notification-read-button";
import { MarkAllNotificationsReadButton } from "@/components/notifications/mark-all-notifications-read-button";

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

export default async function NotificationsPage() {
  const session = await requireRole(["SALES_MANAGER", "PROJECT_ADMIN", "ADMIN"]);
  const receipts = await listNotificationsForUser(session.user.id, 100);
  const unreadCount = receipts.filter((row) => !row.readAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">通知</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            打卡定位与设备 IP 不一致等风险提示
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
                return (
                  <li
                    key={row.id}
                    className={`rounded-md border p-4 ${unread ? "border-amber-300/70 bg-amber-50/40" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
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
                        {row.notification.linkHref ? (
                          <Button asChild variant="link" className="h-auto px-0 text-sm">
                            <Link href={row.notification.linkHref}>查看相关页面</Link>
                          </Button>
                        ) : null}
                      </div>
                      {unread ? (
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
