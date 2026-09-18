import { requireRole } from "@/lib/session";
import { getMapDashboardBundle } from "@/lib/admin/map-dashboard";
import { MapDashboardClient } from "@/components/admin/map-dashboard-client";

type Props = {
  searchParams: Promise<{ sales?: string }>;
};

export default async function MapDashboardPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "SALES_MANAGER"]);
  const query = await searchParams;
  const data = await getMapDashboardBundle();
  const initialSalesId = query.sales?.trim() || null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">地图看板</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          销售以小人标出：仅一般销售；默认今日往来打卡位置，若无则昨日位置并用虚线连到今日计划。管理员与销管不出现。点击小人查看本周往来线路。
        </p>
      </div>
      <MapDashboardClient data={data} initialSalesId={initialSalesId} />
    </div>
  );
}
