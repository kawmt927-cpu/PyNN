import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { canManageWeeklyAssignments } from "@/lib/today-work/weekly-assignments";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES: UserRole[] = ["SALES_MANAGER", "ADMIN"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canManageWeeklyAssignments(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      owner: { select: { id: true, name: true } },
      assistantOwners: {
        select: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!customer) {
    return Response.json({ error: "客户不存在" }, { status: 404 });
  }

  const eligibleAssignees: { id: string; name: string }[] = [];
  if (customer.owner) {
    eligibleAssignees.push(customer.owner);
  }
  for (const row of customer.assistantOwners) {
    if (!eligibleAssignees.some((item) => item.id === row.user.id)) {
      eligibleAssignees.push(row.user);
    }
  }

  return Response.json({
    customerId: customer.id,
    customerName: customer.name,
    eligibleAssignees,
    canAssign: eligibleAssignees.length > 0,
  });
}
