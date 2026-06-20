import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveAmapConfig } from "@/lib/amap/config";
import { resolveCheckInLocation } from "@/lib/amap/reverse-geocode";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const amap = await getEffectiveAmapConfig();
  if (!amap.webServiceKey) {
    return Response.json(
      { error: "未配置高德地图 Web 服务 Key，请管理员在系统配置 → 打卡定位中设置" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const coordType = body.coordType === "gcj02" ? "gcj02" : "wgs84";

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return Response.json({ error: "无效的经纬度" }, { status: 400 });
  }

  try {
    const location = await resolveCheckInLocation({
      latitude,
      longitude,
      coordType,
    });
    return Response.json(location);
  } catch (error) {
    const message = error instanceof Error ? error.message : "地址解析失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
