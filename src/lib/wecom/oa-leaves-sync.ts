/**
 * 企微请假审批同步。
 * 需自建应用开通「审批」数据权限；未配置时返回 skipped，不阻断手工请假。
 *
 * Env:
 * - WECOM_OA_LEAVE_SYNC=1
 * - WECOM_CORP_ID / WECOM_SECRET（或后台企微配置）
 * - WECOM_OA_LEAVE_TEMPLATE_IDS=模板ID1,模板ID2（逗号分隔；未配置则 skipped）
 * - WECOM_OA_LEAVE_TYPE_KEY=personal（写入假种 key，默认 personal）
 */
import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/wecom/api";
import { ensureDefaultLeaveTypes } from "@/lib/personnel/leave-types";
import { eachDayKeyInclusive } from "@/lib/calendar/company-attendance";

const QYAPI = "https://qyapi.weixin.qq.com/cgi-bin";

async function qyPostJson<T extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${QYAPI}${path}?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  const data = (await res.json()) as T & { errcode?: number; errmsg?: string };
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`企业微信 API 错误: ${data.errmsg ?? data.errcode}`);
  }
  return data;
}

function templateIdAllowlist(): string[] {
  return (process.env.WECOM_OA_LEAVE_TEMPLATE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dayKeyFromUnix(sec: number): string {
  const d = new Date(sec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractLeaveRange(detail: Record<string, unknown>): {
  startDayKey: string;
  endDayKey: string;
  wecomUserId: string | null;
} | null {
  const applyer = detail.applyer as { userid?: string } | undefined;
  const wecomUserId = applyer?.userid?.trim() || null;

  const applyData = detail.apply_data as
    | { contents?: Array<{ control?: string; value?: Record<string, unknown> }> }
    | undefined;
  let startSec: number | null = null;
  let endSec: number | null = null;

  for (const c of applyData?.contents ?? []) {
    const v = c.value ?? {};
    const date = v.date as { s_timestamp?: number | string } | undefined;
    const ts = date?.s_timestamp != null ? Number(date.s_timestamp) : NaN;
    if (Number.isFinite(ts) && ts > 0) {
      if (startSec == null) startSec = ts;
      endSec = ts;
    }
    const attendance = v.attendance as
      | { date_range?: { new_begin?: number; new_end?: number } }
      | undefined;
    const nb = attendance?.date_range?.new_begin;
    const ne = attendance?.date_range?.new_end;
    if (nb != null && ne != null) {
      startSec = Number(nb);
      endSec = Number(ne);
    }
  }

  const vacation = detail.vacation as
    | { attendance?: { date_range?: { new_begin?: number; new_end?: number } } }
    | undefined;
  if (vacation?.attendance?.date_range) {
    startSec = Number(vacation.attendance.date_range.new_begin);
    endSec = Number(vacation.attendance.date_range.new_end);
  }

  if (
    startSec == null ||
    endSec == null ||
    !Number.isFinite(startSec) ||
    !Number.isFinite(endSec)
  ) {
    return null;
  }
  return {
    startDayKey: dayKeyFromUnix(startSec),
    endDayKey: dayKeyFromUnix(endSec),
    wecomUserId,
  };
}

export async function runWecomLeaveSyncJob(): Promise<{
  status: "skipped" | "ok" | "failed";
  message: string;
  imported: number;
}> {
  if (process.env.WECOM_OA_LEAVE_SYNC !== "1") {
    return {
      status: "skipped",
      message:
        "未开启企微请假同步（设置 WECOM_OA_LEAVE_SYNC=1，并开通审批 API）",
      imported: 0,
    };
  }

  const templates = templateIdAllowlist();
  if (templates.length === 0) {
    return {
      status: "skipped",
      message:
        "企微请假同步已开，但未配置 WECOM_OA_LEAVE_TEMPLATE_IDS（审批模板 ID，逗号分隔）",
      imported: 0,
    };
  }

  try {
    await ensureDefaultLeaveTypes();
    const typeKey = process.env.WECOM_OA_LEAVE_TYPE_KEY?.trim() || "personal";
    const leaveType = await prisma.personnelLeaveType.findFirst({
      where: { key: typeKey, enabled: true },
    });
    if (!leaveType) {
      return {
        status: "failed",
        message: `假种 key=${typeKey} 不存在或未启用`,
        imported: 0,
      };
    }

    const end = Math.floor(Date.now() / 1000);
    const start = end - 90 * 24 * 3600;
    const spNos: string[] = [];

    for (const tid of templates) {
      let cursor = "";
      for (let page = 0; page < 10; page++) {
        const list = await qyPostJson<{
          sp_no_list?: string[];
          new_next_cursor?: string;
        }>("/oa/getapprovalinfo", {
          starttime: start,
          endtime: end,
          cursor: cursor || undefined,
          size: 100,
          filters: [
            { key: "template_id", value: tid },
            { key: "record_type", value: "1" },
            { key: "sp_status", value: "2" },
          ],
        });
        for (const no of list.sp_no_list ?? []) {
          if (no) spNos.push(no);
        }
        cursor = list.new_next_cursor ?? "";
        if (!cursor) break;
      }
    }

    const uniqueSp = [...new Set(spNos)];
    let imported = 0;

    for (const spNo of uniqueSp) {
      const existing = await prisma.personnelLeave.findFirst({
        where: { wecomSpNo: spNo },
        select: { id: true },
      });
      if (existing) continue;

      const detailRes = await qyPostJson<{ info?: Record<string, unknown> }>(
        "/oa/getapprovaldetail",
        { sp_no: spNo }
      );
      const info = detailRes.info;
      if (!info) continue;

      const range = extractLeaveRange(info);
      if (!range?.wecomUserId) continue;

      const user = await prisma.user.findFirst({
        where: { wecomUserId: range.wecomUserId },
        select: { id: true },
      });
      if (!user) continue;

      const dayKeys = eachDayKeyInclusive(range.startDayKey, range.endDayKey);
      const manualDays = await prisma.personnelLeaveDay.findMany({
        where: {
          userId: user.id,
          dayKey: { in: dayKeys },
          status: "active",
          source: "manual",
        },
        select: { dayKey: true },
      });
      const manualSet = new Set(manualDays.map((d) => d.dayKey));
      const wecomDays = dayKeys.filter((k) => !manualSet.has(k));
      if (wecomDays.length === 0) continue;

      await prisma.personnelLeave.create({
        data: {
          userId: user.id,
          leaveTypeId: leaveType.id,
          source: "wecom",
          status: "active",
          startDayKey: range.startDayKey,
          endDayKey: range.endDayKey,
          wecomSpNo: spNo,
          note: `企微审批 ${spNo}`,
          days: {
            create: wecomDays.map((dayKey) => ({
              userId: user.id,
              dayKey,
              leaveTypeId: leaveType.id,
              source: "wecom",
              status: "active",
              countsAsAbsence: leaveType.countsAsAbsence,
              exemptDailyReport: leaveType.exemptDailyReport,
            })),
          },
        },
      });
      imported += 1;
    }

    return {
      status: "ok",
      message: `企微请假同步完成：扫描 ${uniqueSp.length} 单，新导入 ${imported} 条`,
      imported,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "企微请假同步失败";
    return { status: "failed", message, imported: 0 };
  }
}
