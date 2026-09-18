import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * 人员条配色：约 30 色、色相分散、饱和适中（沿用原 Tailwind 风格并加长）。
 * 同屏按人员列表顺序分配，≤30 人互不撞色。
 */
export const STAFF_COLOR_PALETTE = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#f43f5e", // rose-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#14b8a6", // teal-500
  "#d946ef", // fuchsia-500
  "#65a30d", // lime-600
  "#0ea5e9", // sky-500
  "#ec4899", // pink-500
  "#16a34a", // green-600
  "#a855f7", // purple-500
  "#eab308", // yellow-500
  "#ef4444", // red-500
  "#1d4ed8", // blue-700
  "#047857", // emerald-700
  "#6d28d9", // violet-700
  "#d97706", // amber-600
  "#be123c", // rose-700
  "#0e7490", // cyan-700
  "#c2410c", // orange-700
  "#4338ca", // indigo-700
  "#0f766e", // teal-700
  "#a21caf", // fuchsia-700
  "#0369a1", // sky-700
  "#be185d", // pink-700
  "#78716c", // stone-500
] as const;

const PALETTE = STAFF_COLOR_PALETTE;

function hashKey(key: string, salt: string): number {
  let hash = 2166136261;
  const input = `${salt}:${key}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** 人员类型固定配色（四类角色拉开色相，避免哈希撞成相近绿） */
const PERSONNEL_TYPE_BADGE: Record<string, string> = {
  PROJECT_MANAGER: "bg-blue-100 text-blue-800",
  CONSULTANT: "bg-amber-100 text-amber-900",
  IMPLEMENTER: "bg-rose-100 text-rose-800",
  DEVELOPER: "bg-violet-100 text-violet-800",
};

const PERSONNEL_TYPE_SWATCH: Record<string, string> = {
  PROJECT_MANAGER: "bg-blue-500",
  CONSULTANT: "bg-amber-500",
  IMPLEMENTER: "bg-rose-500",
  DEVELOPER: "bg-violet-500",
};

/** 未知类型回退：色相分散的备用盘 */
const TYPE_BADGE_FALLBACK = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-orange-100 text-orange-900",
  "bg-fuchsia-100 text-fuchsia-800",
  "bg-cyan-100 text-cyan-800",
  "bg-indigo-100 text-indigo-800",
  "bg-lime-100 text-lime-900",
  "bg-stone-100 text-stone-800",
] as const;

const TYPE_SWATCH_FALLBACK = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-fuchsia-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-lime-600",
  "bg-stone-500",
] as const;

const PROJECT_PALETTE = [
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
  "bg-lime-600",
  "bg-sky-500",
  "bg-pink-500",
  "bg-green-600",
  "bg-purple-500",
  "bg-yellow-500",
  "bg-red-500",
  "bg-blue-700",
  "bg-emerald-700",
  "bg-violet-700",
  "bg-amber-600",
  "bg-rose-700",
  "bg-cyan-700",
  "bg-orange-700",
  "bg-indigo-700",
  "bg-teal-700",
  "bg-fuchsia-700",
  "bg-sky-700",
  "bg-pink-700",
  "bg-stone-500",
] as const;

/** 按已知人员列表顺序分配颜色，同屏互不相同 */
export function buildStaffColorMap(userIds: string[]): Map<string, string> {
  const unique = [...new Set(userIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const map = new Map<string, string>();
  unique.forEach((id, index) => {
    map.set(id, PALETTE[index % PALETTE.length]);
  });
  return map;
}

export function projectColorClass(projectId: string): string {
  return PROJECT_PALETTE[hashKey(projectId, "project") % PROJECT_PALETTE.length];
}

/** 无上下文时的回退：哈希取色（返回 CSS 颜色） */
export function staffColorCss(userId: string): string {
  return PALETTE[hashKey(userId, "staff") % PALETTE.length];
}

/** @deprecated 使用 staffColorCss */
export function staffColorClass(userId: string): string {
  return staffColorCss(userId);
}

const StaffColorMapContext = createContext<Map<string, string> | null>(null);

export function StaffColorProvider({
  userIds,
  children,
}: {
  userIds: string[];
  children: ReactNode;
}) {
  const idsKey = userIds.join("\0");
  const map = useMemo(
    () => buildStaffColorMap(userIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey 已覆盖内容变化
    [idsKey]
  );
  return (
    <StaffColorMapContext.Provider value={map}>{children}</StaffColorMapContext.Provider>
  );
}

/** 优先用同屏分配表，保证资源排班页人员颜色互异（CSS color） */
export function useStaffColor(userId: string): string {
  const map = useContext(StaffColorMapContext);
  if (map?.has(userId)) return map.get(userId)!;
  return staffColorCss(userId);
}

/** @deprecated 使用 useStaffColor */
export function useStaffColorClass(userId: string): string {
  return useStaffColor(userId);
}

export function resolveStaffColorCss(
  userId: string,
  peerIds?: string[] | null
): string {
  if (peerIds && peerIds.length > 0) {
    const map = buildStaffColorMap(peerIds);
    return map.get(userId) ?? staffColorCss(userId);
  }
  return staffColorCss(userId);
}

/** 人员类型徽章配色：已知角色固定高对比；未知类型哈希回退 */
export function personnelTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return "bg-muted text-muted-foreground";
  const fixed = PERSONNEL_TYPE_BADGE[type];
  if (fixed) return fixed;
  return TYPE_BADGE_FALLBACK[
    hashKey(type, "personnel-type") % TYPE_BADGE_FALLBACK.length
  ];
}

/** 人员类型彩色图例（小色块），与 badge 配色一一对应 */
export function personnelTypeSwatchClass(type: string | null | undefined): string {
  if (!type) return "bg-muted-foreground/40";
  const fixed = PERSONNEL_TYPE_SWATCH[type];
  if (fixed) return fixed;
  return TYPE_SWATCH_FALLBACK[
    hashKey(type, "personnel-type") % TYPE_SWATCH_FALLBACK.length
  ];
}

export function projectColorLabel(projectId: string): string {
  return projectColorClass(projectId).replace("bg-", "");
}

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
