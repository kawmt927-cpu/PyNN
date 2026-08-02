import type { TeamWorkActivityKind } from "@/lib/today-work/team-work-activity";

export type ActivityOpenTarget = {
  kind: TeamWorkActivityKind;
  id: string;
};

const OPEN_KINDS: TeamWorkActivityKind[] = ["check_in", "follow_up", "daily_log"];

/** 解析 ?open=follow_up:xxx */
export function parseActivityOpenParam(
  raw: string | string[] | null | undefined
): ActivityOpenTarget | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const sep = value.indexOf(":");
  if (sep <= 0) return null;
  const kind = value.slice(0, sep) as TeamWorkActivityKind;
  const id = value.slice(sep + 1).trim();
  if (!id || !OPEN_KINDS.includes(kind)) return null;
  return { kind, id };
}

export function activityOpenKey(kind: TeamWorkActivityKind, id: string) {
  return `${kind}:${id}`;
}

export function activityOpenMatches(
  item: { kind: TeamWorkActivityKind; id: string; checkInId?: string | null },
  open: ActivityOpenTarget | null
) {
  if (!open) return false;
  if (open.kind === item.kind && open.id === item.id) return true;
  // 合并卡片：深链打卡 id 也能命中往来主卡片
  if (open.kind === "check_in" && item.checkInId && open.id === item.checkInId) return true;
  return false;
}

/** 今日工作 / 今日日志深链（企微推送用） */
export function todayActivityHref(open: ActivityOpenTarget) {
  const params = new URLSearchParams({
    open: activityOpenKey(open.kind, open.id),
  });
  return `/today-work?${params.toString()}`;
}

export function mobileActivityHref(open: ActivityOpenTarget) {
  const params = new URLSearchParams({
    open: activityOpenKey(open.kind, open.id),
  });
  return `/mobile/activity?${params.toString()}`;
}
