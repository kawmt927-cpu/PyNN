import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OctopusAvatar } from "@/components/manager/octopus-avatar";

export default async function StatsHubPage() {
  await requireRole(["ADMIN", "SALES_MANAGER"]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold">统计管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          渠道覆盖、销售工作回顾与管理助手集中在此；地图分布请到「地图看板」。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">渠道覆盖</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              普通渠道按公司所在省；全国性渠道按联系人负责省并集。地图不打渠道锚点。
            </p>
            <Button asChild>
              <Link href="/admin/stats/channels">打开渠道覆盖</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">销售工作回顾</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              按销售与任意起止日期，自动汇总打卡、往来、客户覆盖、商机与日报合规；自然月可对照月度 KPI。
            </p>
            <Button asChild>
              <Link href="/admin/stats/work-review">打开工作回顾</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">销售月报</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              按自然月自动汇总跟进、打卡、日报率、签约回款与成本；确认后归档快照。
            </p>
            <Button asChild>
              <Link href="/admin/sales-monthly">打开销售月报</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
