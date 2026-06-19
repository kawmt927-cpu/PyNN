import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/permissions";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await requireSession();
  const role = session.user.role;
  const userId = session.user.id;

  const isSales = ["SALES", "SALES_MANAGER"].includes(role);
  const isPM = ["PROJECT_ADMIN", "PROJECT_MANAGER", "PROJECT_STAFF"].includes(role);

  let stats = {
    customers: 0,
    followUpsToday: 0,
    contracts: 0,
    projects: 0,
    tasks: 0,
  };

  if (isSales) {
    const customerWhere = role === "SALES" ? { ownerId: userId } : {};
    stats.customers = await prisma.customer.count({ where: customerWhere });
    stats.contracts = await prisma.contract.count({
      where: role === "SALES" ? { ownerId: userId } : {},
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    stats.followUpsToday = await prisma.followUp.count({
      where: {
        userId: role === "SALES" ? userId : undefined,
        nextFollowUpAt: { lte: new Date() },
      },
    });
  }

  if (isPM || role === "ADMIN") {
    stats.projects = await prisma.project.count({
      where: role === "PROJECT_MANAGER" ? { projectManagerId: userId } : {},
    });
    stats.tasks = await prisma.task.count({
      where: role === "PROJECT_STAFF" ? { assigneeId: userId, status: { not: "COMPLETED" } } : { status: { not: "COMPLETED" } },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="text-muted-foreground">
          欢迎，{session.user.name}（{ROLE_LABELS[role]}）
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isSales && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">客户数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.customers}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">待跟进</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-600">{stats.followUpsToday}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">合同数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.contracts}</p>
              </CardContent>
            </Card>
          </>
        )}
        {(isPM || role === "ADMIN") && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">项目数</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.projects}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">待办任务</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.tasks}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {role === "SALES" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">快捷入口</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/mobile/log">填写今日销售日志</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/follow-ups">查看待跟进</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/customers">客户列表</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
