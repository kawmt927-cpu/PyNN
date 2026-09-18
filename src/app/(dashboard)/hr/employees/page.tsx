import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import {
  classifyExpiry,
  HR_DOCUMENT_SOON_DAYS,
  listHrDocumentExpiryItems,
} from "@/lib/personnel/hr-document-expiry";

type Props = {
  searchParams: Promise<{ filter?: string }>;
};

function expiryLabel(expiresAt: Date | null | undefined, now: Date) {
  if (!expiresAt) return null;
  const status = classifyExpiry(expiresAt, now);
  if (status === "ok") return null;
  const date = formatDate(expiresAt);
  if (status === "expired") return { text: `已过期 ${date}`, tone: "expired" as const };
  return { text: `${date} 到期`, tone: "soon" as const };
}

export default async function HrEmployeesPage({ searchParams }: Props) {
  await requireRole(["HR", "ADMIN"]);
  const params = await searchParams;
  const filter = params.filter === "expired" || params.filter === "soon" ? params.filter : "all";
  const now = new Date();

  const [usersRaw, expiryItems] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        personnelProfile: { select: { enabled: true } },
        personnelHrProfile: {
          select: { hiredAt: true, idExpiresAt: true },
        },
        personnelHrDocuments: {
          where: { expiresAt: { not: null } },
          select: { title: true, expiresAt: true, kind: true },
        },
      },
    }),
    listHrDocumentExpiryItems(now),
  ]);

  const expiredUserIds = new Set(
    expiryItems.filter((i) => i.status === "expired").map((i) => i.userId)
  );
  const soonUserIds = new Set(expiryItems.filter((i) => i.status === "soon").map((i) => i.userId));

  const users = [...usersRaw]
    .filter((user) => {
      if (filter === "expired") return expiredUserIds.has(user.id);
      if (filter === "soon") return soonUserIds.has(user.id);
      return true;
    })
    .sort((a, b) => {
      const aOff = a.personnelProfile?.enabled === false;
      const bOff = b.personnelProfile?.enabled === false;
      if (aOff !== bOff) return aOff ? 1 : -1;
      return a.name.localeCompare(b.name, "zh-CN");
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">员工档案</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全体员工证件与合同；身份证、证书上传后可识别到期日。{HR_DOCUMENT_SOON_DAYS}{" "}
            天内到期会在工作台汇总并通知。
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/hr">返回工作台</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" asChild>
          <Link href="/hr/employees">全部 {usersRaw.length}</Link>
        </Button>
        <Button variant={filter === "expired" ? "default" : "outline"} size="sm" asChild>
          <Link href="/hr/employees?filter=expired">已过期 {expiredUserIds.size}</Link>
        </Button>
        <Button variant={filter === "soon" ? "default" : "outline"} size="sm" asChild>
          <Link href="/hr/employees?filter=soon">30 天内 {soonUserIds.size}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            员工列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">({users.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">姓名</th>
                  <th className="pb-2 pr-4">角色</th>
                  <th className="pb-2 pr-4">手机</th>
                  <th className="pb-2 pr-4">入职</th>
                  <th className="pb-2 pr-4">证件到期</th>
                  <th className="pb-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const resigned = user.personnelProfile?.enabled === false;
                  const dates = [
                    user.personnelHrProfile?.idExpiresAt,
                    ...user.personnelHrDocuments.map((d) => d.expiresAt),
                  ].filter((d): d is Date => d != null);
                  const nearest = dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
                  const badge = expiryLabel(nearest, now);
                  return (
                    <tr
                      key={user.id}
                      className={`border-b ${resigned ? "bg-muted/30 text-muted-foreground" : ""}`}
                    >
                      <td className="py-2 pr-4 font-medium">
                        {user.name}
                        {resigned ? (
                          <span className="ml-1 text-xs font-normal">离职</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">{ROLE_LABELS[user.role]}</td>
                      <td className="py-2 pr-4">{user.phone ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {formatDate(user.personnelHrProfile?.hiredAt)}
                      </td>
                      <td className="py-2 pr-4">
                        {badge ? (
                          <span
                            className={
                              badge.tone === "expired" ? "text-destructive" : "text-amber-700"
                            }
                          >
                            {badge.text}
                          </span>
                        ) : nearest ? (
                          formatDate(nearest)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/hr/employees/${user.id}`}>档案</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {users.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">暂无员工。</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
