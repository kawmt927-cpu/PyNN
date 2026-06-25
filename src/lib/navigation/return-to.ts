export const RETURN_TO_PARAM = "returnTo";

const ALLOWED_PREFIXES = [
  "/opportunities",
  "/customers",
  "/contracts",
  "/follow-ups",
  "/today-work",
  "/plans-tasks",
  "/daily-reports",
  "/sales-log",
  "/mobile",
  "/projects",
  "/approvals",
  "/admin",
  "/sales-costs",
  "/personnel",
  "/sales-personnel",
  "/my-tasks",
  "/customers/claims",
];

export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;

  let decoded = value;
  try {
    if (value.includes("%")) {
      decoded = decodeURIComponent(value);
    }
  } catch {
    return null;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("://")) {
    return null;
  }

  const pathOnly = decoded.split("?")[0];
  if (pathOnly === "/") return decoded;

  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  );
  if (!allowed) return null;

  return decoded;
}

export function resolveReturnTo(
  raw: string | null | undefined,
  fallback: string
): string {
  return sanitizeReturnTo(raw) ?? fallback;
}

export function withReturnTo(targetHref: string, returnTo: string): string {
  const sanitized = sanitizeReturnTo(returnTo);
  if (!sanitized) return targetHref;

  const [pathname, search = ""] = targetHref.split("?");
  const params = new URLSearchParams(search);
  params.set(RETURN_TO_PARAM, sanitized);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** 当前页路径，用于向下游页面传递 returnTo */
export function selfReturnPath(
  pathname: string,
  searchParams?: { returnTo?: string }
): string {
  const preserved = sanitizeReturnTo(searchParams?.returnTo);
  if (!preserved) return pathname;
  return withReturnTo(pathname, preserved);
}

export function resolveBackNavigation(
  searchParams: { returnTo?: string } | undefined,
  fallback: string
) {
  const backHref = resolveReturnTo(searchParams?.returnTo, fallback);
  return {
    backHref,
    backLabel: returnLabelForPath(backHref),
  };
}

export function opportunityListPath(view: string) {
  return view === "not_signed" ? "/opportunities" : `/opportunities?view=${view}`;
}

export function customerListPath(view: string) {
  if (view === "all") return "/customers?view=all";
  if (view === "pool") return "/customers?view=pool";
  return "/customers?view=mine";
}

export function returnLabelForPath(path: string): string {
  const pathOnly = path.split("?")[0];

  if (pathOnly === "/opportunities" || path.startsWith("/opportunities?")) {
    return "返回商机管理";
  }
  if (/^\/opportunities\/[^/]+\/follow-ups$/.test(pathOnly)) {
    return "返回商机跟进";
  }
  if (/^\/opportunities\/[^/]+\/edit$/.test(pathOnly)) {
    return "返回编辑商机";
  }
  if (/^\/opportunities\/[^/]+\/create-contract$/.test(pathOnly)) {
    return "返回创建合同";
  }
  if (pathOnly === "/opportunities/new") {
    return "返回新建商机";
  }
  if (/^\/opportunities\/[^/]+$/.test(pathOnly)) {
    return "返回商机详情";
  }

  if (pathOnly === "/customers" || path.startsWith("/customers?")) {
    return "返回客户列表";
  }
  if (/^\/customers\/[^/]+\/follow-ups$/.test(pathOnly)) {
    return "返回客户跟进";
  }
  if (/^\/customers\/[^/]+\/edit$/.test(pathOnly)) {
    return "返回编辑客户";
  }
  if (pathOnly === "/customers/new") {
    return "返回新建客户";
  }
  if (/^\/customers\/[^/]+$/.test(pathOnly)) {
    return "返回客户详情";
  }

  if (pathOnly === "/contracts" || path.startsWith("/contracts?")) {
    return "返回合同列表";
  }
  if (/^\/contracts\/new$/.test(pathOnly)) {
    return "返回新建合同";
  }
  if (/^\/contracts\/[^/]+$/.test(pathOnly)) {
    return "返回合同详情";
  }

  if (pathOnly === "/follow-ups") {
    return "返回待跟进";
  }

  return "返回";
}
