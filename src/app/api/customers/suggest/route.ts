import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { resolveCustomerListView } from "@/lib/customers/access";
import { searchCustomersForUser } from "@/lib/search/entity-suggest";

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
  const mode = params.mode ?? "list";
  const q = params.q?.trim() ?? "";

  if (!q) {
    return Response.json({ items: [] });
  }

  if (mode === "form") {
    const excludeIds = params.excludeIds
      ? params.excludeIds.split(",").filter(Boolean)
      : undefined;

    const items = await searchCustomersForUser(session.user.role, session.user.id, q, {
      excludeId: params.excludeId,
      excludeIds,
    });

    return Response.json({ items });
  }

  const view = resolveCustomerListView(params.view, session.user.role);
  const items = await searchCustomersForUser(session.user.role, session.user.id, q, {
    view: view === "pool" ? "pool" : view === "all" ? "all" : "mine",
  });

  return Response.json({ items });
}
