"use server";

import { revalidatePath } from "next/cache";
import { CompanyCalendarDayKind } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  invalidateCompanyCalendarCache,
  refreshCompanyCalendarCache,
} from "@/lib/calendar/cn-daily-report-days";
import { syncCompanyCalendarYear } from "@/lib/calendar/company-calendar-sync";
import type { ActionResult } from "@/lib/action-result";

async function requireHr() {
  return requireRole(["HR", "ADMIN"]);
}

export async function upsertCompanyCalendarDayAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireHr();
    const dayKey = String(formData.get("dayKey") ?? "").trim();
    const kindRaw = String(formData.get("kind") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim() || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { error: "日期无效" };
    if (kindRaw !== "HOLIDAY_OFF" && kindRaw !== "MAKEUP_WORKDAY" && kindRaw !== "CLEAR") {
      return { error: "类型无效" };
    }
    const year = Number(dayKey.slice(0, 4));

    if (kindRaw === "CLEAR") {
      await prisma.companyCalendarDay.deleteMany({ where: { dayKey } });
    } else {
      await prisma.companyCalendarDay.upsert({
        where: { dayKey },
        create: {
          dayKey,
          year,
          kind: kindRaw as CompanyCalendarDayKind,
          name,
          source: "manual",
        },
        update: {
          kind: kindRaw as CompanyCalendarDayKind,
          name,
          source: "manual",
        },
      });
    }
    invalidateCompanyCalendarCache();
    await refreshCompanyCalendarCache();
    revalidatePath("/hr/calendar");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function syncCompanyCalendarYearAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireHr();
    const year = Number(formData.get("year"));
    if (!Number.isFinite(year) || year < 2024) return { error: "年份无效" };
    const result = await syncCompanyCalendarYear({ year, force: true, notify: false });
    revalidatePath("/hr/calendar");
    if (result.status === "ok" || result.status === "skipped") return {};
    return { error: result.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
