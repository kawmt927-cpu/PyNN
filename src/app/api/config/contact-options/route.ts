import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadContactFormOptions } from "@/lib/config-options";
import type { UserRole } from "@prisma/client";

const ALLOWED_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const options = await loadContactFormOptions();
  return Response.json(options);
}
