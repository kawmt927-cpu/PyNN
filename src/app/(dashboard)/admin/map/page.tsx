import { requireRole } from "@/lib/session";
import { getMapDashboardBundle } from "@/lib/admin/map-dashboard";
import { MapDashboardClient } from "@/components/admin/map-dashboard-client";

export default async function MapDashboardPage() {
  await requireRole(["ADMIN", "SALES_MANAGER"]);
  const data = await getMapDashboardBundle();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">地图看板</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          勾选「渠道统计」可看各省覆盖着色与明细（不打渠道锚点）；直接客户、商机用锚点，客户锚点旁显示客户名称。
        </p>
      </div>
      <MapDashboardClient data={data} />
    </div>
  );
}
