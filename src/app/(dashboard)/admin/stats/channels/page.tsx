import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getChannelDashboardBundle } from "@/lib/admin/channel-dashboard";
import { ChannelCoverageStatsClient } from "@/components/admin/channel-coverage-stats-client";

export default async function StatsChannelsPage() {
  const session = await requireRole(["ADMIN", "SALES_MANAGER"]);
  const data = await getChannelDashboardBundle();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/stats" className="hover:underline">
              统计管理
            </Link>
            <span className="mx-1.5">/</span>
            渠道覆盖
          </p>
          <h1 className="mt-1 text-2xl font-bold">渠道覆盖</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按「全国性渠道」勾选的覆盖省份计家数；普通渠道按档案所在省。地图不展示渠道锚点。
          </p>
        </div>
        <Link
          href="/admin/map"
          className="text-sm text-primary hover:underline"
        >
          去地图看板
        </Link>
      </div>
      <ChannelCoverageStatsClient
        data={data}
        canEditTargets={session.user.role === "ADMIN"}
      />
    </div>
  );
}
