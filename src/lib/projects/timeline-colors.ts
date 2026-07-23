const PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-sky-500",
] as const;

function hashKey(key: string, salt: string): number {
  let hash = 0;
  const input = `${salt}:${key}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash + input.charCodeAt(i) * (i + 1)) % 1000;
  }
  return hash;
}

const TYPE_BADGE_PALETTE = [
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-900",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-cyan-100 text-cyan-800",
  "bg-orange-100 text-orange-900",
  "bg-indigo-100 text-indigo-800",
  "bg-teal-100 text-teal-800",
  "bg-fuchsia-100 text-fuchsia-800",
  "bg-lime-100 text-lime-900",
  "bg-blue-100 text-blue-800",
] as const;

export function projectColorClass(projectId: string): string {
  return PALETTE[hashKey(projectId, "project") % PALETTE.length];
}

export function staffColorClass(userId: string): string {
  return PALETTE[hashKey(userId, "staff") % PALETTE.length];
}

/** 按类型键自动配色；新增/更名类型无需改代码 */
export function personnelTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return "bg-muted text-muted-foreground";
  return TYPE_BADGE_PALETTE[hashKey(type, "personnel-type") % TYPE_BADGE_PALETTE.length];
}

export function projectColorLabel(projectId: string): string {
  return projectColorClass(projectId).replace("bg-", "");
}

/** 长周期表头：按年份交替浅色底，便于跨年区分 */
const YEAR_BAND_PALETTE = [
  "bg-sky-100/90 text-sky-950",
  "bg-amber-100/90 text-amber-950",
  "bg-emerald-100/80 text-emerald-950",
  "bg-rose-100/80 text-rose-950",
] as const;

const YEAR_BAND_MUTED = [
  "bg-sky-50/80",
  "bg-amber-50/80",
  "bg-emerald-50/70",
  "bg-rose-50/70",
] as const;

export function scheduleYearBandClass(year: number): string {
  return YEAR_BAND_PALETTE[((year % 4) + 4) % 4];
}

export function scheduleYearBandMutedClass(year: number): string {
  return YEAR_BAND_MUTED[((year % 4) + 4) % 4];
}
