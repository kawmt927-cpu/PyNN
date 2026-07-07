import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCustomerForUser } from "@/lib/customers/access";
import {
  getCustomerPendingFollowPlans,
  serializeCustomerPendingFollowPlan,
} from "@/lib/follow-ups/unified";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const customer = await getCustomerForUser(id, session.user.role, session.user.id);
  if (!customer) {
    return Response.json({ items: [] });
  }

  const items = await getCustomerPendingFollowPlans(id, new Date());
  return Response.json({ items: items.map(serializeCustomerPendingFollowPlan) });
}
