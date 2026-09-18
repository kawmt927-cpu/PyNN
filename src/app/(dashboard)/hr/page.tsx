import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";
import { prisma } from "@/lib/prisma";
import { listHrDocumentExpiryItems } from "@/lib/personnel/hr-document-expiry";

export default async function HrHomePage() {
  await requireRole(["HR", "ADMIN"]);

  const expenseOn = isExpenseFeatureEnabled();
  const [pendingHrConfirm, expiryItems] = await Promise.all([
    expenseOn
      ? prisma.expenseClaim.count({ where: { status: "PENDING_HR" } })
      : Promise.resolve(0),
    listHrDocumentExpiryItems(),
  ]);
  const expiredCount = expiryItems.filter((i) => i.status === "expired").length;
  const soonCount = expiryItems.filter((i) => i.status === "soon").length;
  const preview = expiryItems.slice(0, 4);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">行政人事工作台</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          维护人员成本、员工档案证件，以及报销行政确认。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">员工档案</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              已过期{" "}
              <span className="font-medium text-destructive">{expiredCount}</span>{" "}
              件，30 天内到期{" "}
              <span className="font-medium text-amber-700">{soonCount}</span> 件。
            </p>
            {preview.length > 0 ? (
              <ul className="space-y-1 text-foreground">
                {preview.map((item) => (
                  <li key={item.key}>
                    <Link
                      className="underline-offset-2 hover:underline"
                      href={`/hr/employees/${item.userId}`}
                    >
                      {item.userName} · {item.title}
                      {item.status === "expired"
                        ? "（已过期）"
                        : item.daysLeft === 0
                          ? "（今天到期）"
                          : `（${item.daysLeft} 天）`}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无即将到期的证件。</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/hr/employees">打开档案</Link>
              </Button>
              {expiredCount > 0 ? (
                <Button variant="outline" asChild>
                  <Link href="/hr/employees?filter=expired">查看已过期</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">公司放假日历</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>国办自动同步 + 手工改日；驱动日报考核与出勤天数。</p>
            <Button asChild>
              <Link href="/hr/calendar">打开日历</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">请假登记</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>事假/病假等按规则扣款；请假日免交日报。手工优先于企微同步。</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/hr/leaves">打开请假</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/hr/leave-types">假种规则</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">人员成本</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>下月初确认上月成本：奖金、扣罚与基础成本核对后再生效进项目人天。</p>
            <Button asChild>
              <Link href="/personnel">打开人员成本</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">报销确认</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {expenseOn ? (
              <>
                <p>
                  待行政确认{" "}
                  <span className="font-medium text-foreground">{pendingHrConfirm}</span>{" "}
                  笔。通过后将交管理员终审打款。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href="/expenses">报销列表</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/approvals?type=expense">审批中心</Link>
                  </Button>
                </div>
              </>
            ) : (
              <p>报销模块暂未对生产环境开放（需开启功能开关后可用）。</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">差旅住宿标准</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>按城市线级配置每晚住宿上限，供报销校验使用。</p>
            <Button variant="outline" asChild>
              <Link href="/admin/settings?tab=expense-travel">打开报销设置</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
