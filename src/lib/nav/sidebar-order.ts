import type { NavItem } from "@/lib/nav/primary-nav";

/** 解析用户保存的侧栏顺序（nav id 列表） */
export function parseSidebarNavOrder(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
  return ids.length > 0 ? ids : null;
}

/**
 * 按用户自定义顺序重排侧栏。
 * 已保存但不在当前可见列表中的 id 忽略；新增入口按默认相对位置追加到末尾。
 */
export function applySidebarNavOrder(
  nav: NavItem[],
  order: string[] | null | undefined
): NavItem[] {
  if (!order?.length) return nav;

  const byId = new Map(nav.map((item) => [item.id, item]));
  const result: NavItem[] = [];

  for (const id of order) {
    const item = byId.get(id);
    if (!item) continue;
    result.push(item);
    byId.delete(id);
  }

  for (const item of nav) {
    if (byId.has(item.id)) result.push(item);
  }

  return result;
}
