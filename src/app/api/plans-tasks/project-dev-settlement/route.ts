import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listProjectDevSettlementItems } from "@/lib/plans-tasks/monthly-kpi";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "SALES_MANAGER" && session.user.role !== "ADMIN")) {
    return Response.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim() ?? "";
  const year = Number.parseInt(searchParams.get("year") ?? "", 10);
  const month = Number.parseInt(searchParams.get("month") ?? "", 10);
  if (!userId || !Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return Response.json({ error: "参数无效" }, { status: 400 });
  }

  const items = await listProjectDevSettlementItems(userId, year, month);
  return Response.json({ items });
}
