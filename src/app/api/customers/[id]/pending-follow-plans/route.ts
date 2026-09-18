import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCustomerForUser } from "@/lib/customers/access";
import {
  getCustomerPendingFollowPlans,
  serializeCustomerPendingFollowPlan,
} from "@/lib/follow-ups/unified";
import { listPendingAssignmentsForFollowUp } from "@/lib/today-work/assignment-follow-up-complete";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  // 录入往来时需能看到非本人客户的待跟进/任务
  const customer = await getCustomerForUser(id, session.user.role, session.user.id, {
    allowFollowUpOnAnyCustomer: true,
  });
  if (!customer) {
    return Response.json({ items: [], assignments: [] });
  }

  const [items, assignments] = await Promise.all([
    getCustomerPendingFollowPlans(id, new Date(), { forUserId: session.user.id }),
    listPendingAssignmentsForFollowUp({
      assigneeId: session.user.id,
      customerId: id,
    }),
  ]);
  return Response.json({
    items: items.map(serializeCustomerPendingFollowPlan),
    assignments,
  });
}
