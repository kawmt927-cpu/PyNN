"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getDefaultHomeForRole } from "@/lib/permissions";
import { canAccessSalesMobile, getMobileHomeForRole } from "@/lib/mobile/sales-roles";
import { UI_MODE_COOKIE, UI_MODE_COOKIE_OPTIONS } from "@/lib/mobile/ui-mode";

export async function switchToMobileUi() {
  const session = await requireSession();
  if (!canAccessSalesMobile(session.user.role)) {
    redirect("/mobile/pc-only");
  }
  const store = await cookies();
  store.set(UI_MODE_COOKIE, "mobile", UI_MODE_COOKIE_OPTIONS);
  redirect(getMobileHomeForRole(session.user.role));
}

export async function switchToPcUi() {
  const session = await requireSession();
  if (!canAccessSalesMobile(session.user.role)) {
    redirect(getDefaultHomeForRole(session.user.role));
  }
  const store = await cookies();
  store.set(UI_MODE_COOKIE, "pc", UI_MODE_COOKIE_OPTIONS);
  redirect(getDefaultHomeForRole(session.user.role));
}
