import { getServerSession } from "next-auth";
import { OpportunityStatus, UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { searchOpportunitiesForUser } from "@/lib/search/entity-suggest";

const ALLOWED_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const q = params.q?.trim() ?? "";
  const customerId = params.customerId?.trim();
  const statusParam = params.status as OpportunityStatus | "ALL" | undefined;
  const status =
    statusParam && ["NOT_SIGNED", "SIGNED", "ABANDONED", "ALL"].includes(statusParam)
      ? statusParam
      : "ALL";

  if (!q && !customerId) {
    return Response.json({ items: [] });
  }

  const rows = await searchOpportunitiesForUser(session.user.role, session.user.id, q, {
    status: status === "ALL" ? "ALL" : status,
    customerId,
  });

  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    customerName: row.customer?.name ?? "未指定客户",
  }));

  return Response.json({ items });
}
