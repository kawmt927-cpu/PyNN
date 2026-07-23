import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS, ROLE_PRIVILEGE_RANK } from "@/lib/permissions";
import { countPendingWeComAccessRequests } from "@/lib/wecom/access-request";
import { unbindUserWecom } from "./actions";
import { UnbindWecomButton } from "@/components/admin/unbind-wecom-button";

/** 状态排序：正常 → 待激活 → 已停用 */
function userStatusRank(user: {
  phone: string | null;
  passwordHash: string | null;
  personnelProfile: { enabled: boolean } | null;
}): number {
  if (user.personnelProfile?.enabled === false) return 2;
  if (user.phone && user.passwordHash) return 0;
  return 1;
}

export default async function AdminUsersPage() {
  await requireRole(["ADMIN"]);

  const [usersRaw, pendingWeComCount] = await Promise.all([
    prisma.user.findMany({
      include: {
        personnelProfile: { select: { enabled: true, isPresales: true, staffCategory: true } },
      },
    }),
    countPendingWeComAccessRequests(),
  ]);

  const users = [...usersRaw].sort((a, b) => {
    const statusDiff = userStatusRank(a) - userStatusRank(b);
    if (statusDiff !== 0) return statusDiff;
    const roleDiff =
      ROLE_PRIVILEGE_RANK[a.role] - ROLE_PRIVILEGE_RANK[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name, "zh-CN");
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/users/wecom-requests">
              企微开通申请
              {pendingWeComCount > 0 ? (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">
                  {pendingWeComCount}
                </span>
              ) : null}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/users/new">新建用户</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            全部用户
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({users.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">姓名</th>
                  <th className="pb-2 pr-4">手机号</th>
                  <th className="pb-2 pr-4">邮箱</th>
                  <th className="pb-2 pr-4">角色</th>
                  <th className="pb-2 pr-4">状态</th>
                  <th className="pb-2 pr-4">企微</th>
                  <th className="pb-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-3 pr-4 font-medium">{u.name}</td>
                    <td className="py-3 pr-4">{u.phone ?? "—"}</td>
                    <td className="py-3 pr-4">{u.email ?? "—"}</td>
                    <td className="py-3 pr-4">{ROLE_LABELS[u.role]}</td>
                    <td className="py-3 pr-4">
                      {u.personnelProfile?.enabled === false ? (
                        <span className="text-red-600">已停用</span>
                      ) : u.phone && u.passwordHash ? (
                        <span className="text-green-600">正常</span>
                      ) : (
                        <span className="text-amber-600">待激活</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {u.wecomUserId ?? "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/users/${u.id}/edit`}>编辑</Link>
                        </Button>
                        {u.wecomUserId ? (
                          <UnbindWecomButton
                            userId={u.id}
                            userName={u.name}
                            action={unbindUserWecom}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
