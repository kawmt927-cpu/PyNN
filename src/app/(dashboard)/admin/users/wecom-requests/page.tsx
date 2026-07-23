import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listPendingWeComAccessRequests } from "@/lib/wecom/access-request";
import { WeComAccessRequestsPanel } from "@/components/admin/wecom-access-requests-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminWeComRequestsPage() {
  await requireRole(["ADMIN"]);

  const [requests, users] = await Promise.all([
    listPendingWeComAccessRequests(),
    prisma.user.findMany({
      where: { wecomUserId: null },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">企微开通申请</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            审核通过后将创建或绑定 CRM 账号，并分配角色。申请人可用企微授权或手机号密码登录。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/users">返回用户列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            待审批
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({requests.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WeComAccessRequestsPanel
            requests={requests.map((r) => ({
              id: r.id,
              wecomUserId: r.wecomUserId,
              name: r.name,
              phone: r.phone,
              message: r.message,
              createdAt: r.createdAt.toISOString(),
              hasPassword: Boolean(r.passwordHash),
            }))}
            usersWithoutWecom={users}
          />
        </CardContent>
      </Card>
    </div>
  );
}
