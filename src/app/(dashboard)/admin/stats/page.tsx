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
          渠道覆盖统计与管理助手集中在此；地图分布请到「地图看板」。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">渠道覆盖</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              按「全国性渠道」的覆盖省份统计；普通渠道按档案所在省。地图不打渠道锚点。
            </p>
            <Button asChild>
              <Link href="/admin/stats/channels">打开渠道覆盖</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg">
              <OctopusAvatar mood="wink" size={36} />
              <span>管理助手</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              章鱼顾问「触触」帮你查团队日报、跟进、商机与回款，给出运营建议。只读，不改数据。
            </p>
            <Button asChild>
              <Link href="/admin/stats/assistant">打开管理助手</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
