import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listTodayCustomerCheckInsForUser } from "@/lib/sales-log/check-in";
import type { UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !SALES_LOG_ROLES.includes(session.user.role)) {
    return Response.json({ error: "未登录或无权操作" }, { status: 401 });
  }

  const customerId = new URL(req.url).searchParams.get("customerId")?.trim();
  if (!customerId) {
    return Response.json({ error: "缺少 customerId" }, { status: 400 });
  }

  const items = await listTodayCustomerCheckInsForUser(session.user.id, customerId);
  return Response.json({
    items: items.map((row) => ({
      id: row.id,
      checkedInAt: row.checkedInAt.toISOString(),
      status: row.status,
      customerName: row.customer?.name ?? null,
    })),
  });
}
