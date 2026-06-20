import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCustomerForUser } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";

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

  const contacts = await prisma.contact.findMany({
    where: { customerId: id },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: { id: true, name: true, title: true, phone: true, isPrimary: true },
  });

  return Response.json({ items: contacts });
}
