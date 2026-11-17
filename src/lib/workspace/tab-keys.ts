/** 工作区标签稳定 key：功能入口按 nav id；实体按类型+主键 */

export type WorkspaceEntityKind = "customer" | "opportunity" | "contract";

export function navTabKey(hubTabId: string): string {
  return `nav:${hubTabId}`;
}

/**
 * 返回列表时与侧栏对齐的标签 key，避免 `nav:list:...` 与侧栏双开。
 * 未知路径回退为 `nav:list:${path}`。
 */
export function listTabKeyForPath(path: string): string {
  const pathOnly = path.split("?")[0] || path;
  switch (pathOnly) {
    case "/opportunities":
      return navTabKey("crm:opportunities");
    case "/customers":
      return navTabKey("crm:customers");
    case "/contracts":
      return navTabKey("crm:contracts");
    case "/projects":
      return navTabKey("projects:list");
    case "/projects/schedule":
      return navTabKey("projects:schedule");
    case "/follow-ups":
      return navTabKey("work:follow-ups");
    case "/today-work":
      return navTabKey("work:today");
    default:
      return `nav:list:${pathOnly}`;
  }
}

export function entityTabKey(kind: WorkspaceEntityKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseEntityTabKey(
  key: string
): { kind: WorkspaceEntityKind; id: string } | null {
  const m = /^(customer|opportunity|contract):(.+)$/.exec(key);
  if (!m) return null;
  return { kind: m[1] as WorkspaceEntityKind, id: m[2] };
}

/** 从业务路径解析客户/商机/合同实体（含 /follow-ups、/edit 等子路径） */
export function parseEntityFromHref(
  href: string
): { kind: WorkspaceEntityKind; id: string } | null {
  try {
    const path = new URL(href, "http://local.invalid").pathname;
    const customer = /^\/customers\/([^/]+)/.exec(path);
    if (customer?.[1] && customer[1] !== "new") {
      return { kind: "customer", id: customer[1] };
    }
    const opportunity = /^\/opportunities\/([^/]+)/.exec(path);
    if (opportunity?.[1] && opportunity[1] !== "new") {
      return { kind: "opportunity", id: opportunity[1] };
    }
    const contract = /^\/contracts\/([^/]+)/.exec(path);
    if (contract?.[1] && contract[1] !== "new" && contract[1] !== "external-costs") {
      return { kind: "contract", id: contract[1] };
    }
  } catch {
    // ignore
  }
  return null;
}

/** 给 iframe 用的嵌入地址 */
export function withEmbedParam(href: string): string {
  try {
    const url = new URL(href, "http://local.invalid");
    url.searchParams.set("embed", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const join = href.includes("?") ? "&" : "?";
    return `${href}${join}embed=1`;
  }
}

export function stripEmbedParam(href: string): string {
  try {
    const url = new URL(href, "http://local.invalid");
    url.searchParams.delete("embed");
    const q = url.searchParams.toString();
    return `${url.pathname}${q ? `?${q}` : ""}${url.hash}`;
  } catch {
    return href;
  }
}
