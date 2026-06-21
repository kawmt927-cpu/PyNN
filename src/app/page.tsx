import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDefaultHomeForRole } from "@/lib/permissions";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(getDefaultHomeForRole(session.user.role));
}
