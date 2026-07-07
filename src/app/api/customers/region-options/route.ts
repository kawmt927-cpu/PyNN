import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { customerListWhere, resolveCustomerListView } from "@/lib/customers/access";
import { getCustomerRegionOptions } from "@/lib/customers/region-options";

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
  const view = resolveCustomerListView(params.view, session.user.role);
  const province = params.province?.trim() || undefined;
  const city = params.city?.trim() || undefined;

  const baseWhere = customerListWhere(session.user.role, session.user.id, view);
  const options = await getCustomerRegionOptions(baseWhere, province, city);

  return Response.json(options);
}
