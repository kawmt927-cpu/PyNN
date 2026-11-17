"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type MouseEvent } from "react";
import { signOut } from "next-auth/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  isHubTabActive,
  type HubTab,
  type NavItem,
} from "@/lib/nav/primary-nav";
import type { ImpersonationTarget } from "@/lib/auth/impersonation";
import { AdminImpersonationPanel } from "@/components/admin/admin-impersonation-panel";
import { ClientModeSwitch } from "@/components/layout/client-mode-switch";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { useWorkspaceTabsOptional } from "@/components/workspace/workspace-tabs-context";
import { useWorkspaceAccountSwitch } from "@/components/workspace/use-workspace-account-switch";
import { navTabKey } from "@/lib/workspace/tab-keys";

type Props = {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  pendingApprovalCount?: number;
  unreadNotificationCount?: number;
  impersonationTargets?: ImpersonationTarget[];
  impersonatorName?: string | null;
  showMobileSwitch?: boolean;
};

const OPEN_IDS_STORAGE_KEY = "crm.sidebar.openNavIds";

function resolveActiveNavId(pathname: string, nav: NavItem[]): string | null {
  let best: NavItem | null = null;
  let bestLen = -1;
  for (const item of nav) {
    for (const prefix of item.matchPrefixes) {
      const base = prefix.split("?")[0];
      if (pathname === base || pathname.startsWith(`${base}/`)) {
        if (base.length > bestLen) {
          best = item;
          bestLen = base.length;
        }
      }
    }
  }
  return best?.id ?? null;
}

function secondaryItems(item: NavItem): HubTab[] {
  return item.tabs.length > 1 ? item.tabs : [];
}

function readStoredOpenIds(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_IDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function writeStoredOpenIds(ids: string[]) {
  try {
    localStorage.setItem(OPEN_IDS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

function SidebarTabLink({
  tab,
  pathname,
  navItemId,
}: {
  tab: HubTab;
  pathname: string;
  navItemId: string;
}) {
  const needsSearch = tab.href.includes("?");
  if (!needsSearch) {
    return (
      <SidebarTabAnchor
        tab={tab}
        navItemId={navItemId}
        active={isHubTabActive(tab.href, pathname, "")}
      />
    );
  }
  return (
    <Suspense
      fallback={
        <SidebarTabAnchor
          tab={tab}
          navItemId={navItemId}
          active={isHubTabActive(tab.href, pathname, "")}
        />
      }
    >
      <SidebarTabLinkWithSearch tab={tab} pathname={pathname} navItemId={navItemId} />
    </Suspense>
  );
}

function SidebarTabLinkWithSearch({
  tab,
  pathname,
  navItemId,
}: {
  tab: HubTab;
  pathname: string;
  navItemId: string;
}) {
  const searchParams = useSearchParams();
  return (
    <SidebarTabAnchor
      tab={tab}
      navItemId={navItemId}
      active={isHubTabActive(tab.href, pathname, searchParams.toString())}
    />
  );
}

function SidebarTabAnchor({
  tab,
  active,
  navItemId,
}: {
  tab: HubTab;
  active: boolean;
  navItemId: string;
}) {
  const workspace = useWorkspaceTabsOptional();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!workspace) return;
    e.preventDefault();
    workspace.openOrFocusTab({
      key: navTabKey(`${navItemId}:${tab.id}`),
      title: tab.label,
      href: tab.href,
    });
  }

  return (
    <Link
      href={tab.href}
      prefetch
      onClick={handleClick}
      className={cn(
        "block rounded-md px-3 py-1.5 text-sm",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span className="truncate">{tab.label}</span>
    </Link>
  );
}

function AppSidebarInner({
  nav,
  userName,
  roleLabel,
  pendingApprovalCount = 0,
  unreadNotificationCount = 0,
  impersonationTargets = [],
  impersonatorName = null,
  showMobileSwitch = false,
}: Props) {
  const pathname = usePathname();
  const workspace = useWorkspaceTabsOptional();
  const accountSwitch = useWorkspaceAccountSwitch();
  /** 用户手动展开的一级；各组独立，互不收起 */
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const showImpersonation =
    Boolean(impersonatorName) || impersonationTargets.length > 0;
  const highlightPath =
    workspace?.activeHref?.split("?")[0] || pathname;
  const activeId = resolveActiveNavId(highlightPath, nav);

  useEffect(() => {
    setOpenIds(readStoredOpenIds());
    setHydrated(true);
  }, []);

  // 当前页所属一级始终记入展开集合（常见侧栏：当前位置可见）
  useEffect(() => {
    if (!hydrated || !activeId) return;
    const activeItem = nav.find((item) => item.id === activeId);
    if (!activeItem || secondaryItems(activeItem).length === 0) return;
    setOpenIds((prev) => {
      if (prev.includes(activeId)) return prev;
      const next = [...prev, activeId];
      writeStoredOpenIds(next);
      return next;
    });
  }, [activeId, hydrated, nav]);

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeStoredOpenIds(next);
      return next;
    });
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-4">
        <h1 className="text-lg font-bold text-primary">培安 CRM</h1>
        <p className="text-xs text-muted-foreground">医院软件 CRM + 项目管理</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const children = secondaryItems(item);
          const hasChildren = children.length > 0;
          const isSectionActive = item.id === activeId;
          const isOpen = hasChildren && (isSectionActive || openIds.includes(item.id));
          const showApprovalDot =
            item.badge === "approvals" && pendingApprovalCount > 0;
          const showNotificationDot =
            item.badge === "notifications" && unreadNotificationCount > 0;
          const showInboxDot =
            item.badge === "inbox" &&
            (pendingApprovalCount > 0 || unreadNotificationCount > 0);
          const showDot = showApprovalDot || showNotificationDot || showInboxDot;

          const primaryClass = cn(
            "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
            isSectionActive && !hasChildren
              ? "bg-primary text-primary-foreground"
              : isSectionActive
                ? "bg-muted font-medium text-foreground"
                : "text-foreground hover:bg-muted"
          );

          const badge = showDot ? (
            <>
              <span className="sr-only">
                {showInboxDot
                  ? [
                      pendingApprovalCount > 0
                        ? `${pendingApprovalCount} 条待审批`
                        : null,
                      unreadNotificationCount > 0
                        ? `${unreadNotificationCount} 条未读通知`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("，")
                  : showApprovalDot
                    ? `${pendingApprovalCount} 条待审批`
                    : `${unreadNotificationCount} 条未读通知`}
              </span>
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full bg-red-500",
                  isSectionActive && !hasChildren
                    ? "ring-2 ring-primary-foreground/30"
                    : "ring-2 ring-card"
                )}
              />
            </>
          ) : null;

          return (
            <div key={item.id} className="space-y-0.5">
              {hasChildren ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    if (isSectionActive) return;
                    toggleOpen(item.id);
                  }}
                  className={primaryClass}
                >
                  <span className="truncate text-left">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {badge}
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </span>
                </button>
              ) : (
                <Link
                  href={item.href}
                  prefetch
                  className={primaryClass}
                  onClick={(e) => {
                    if (!workspace) return;
                    e.preventDefault();
                    workspace.openOrFocusTab({
                      key: navTabKey(item.id),
                      title: item.label,
                      href: item.href,
                    });
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  {badge}
                </Link>
              )}

              {hasChildren ? (
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="ml-2 space-y-0.5 border-l pl-2 pb-0.5">
                      {children.map((tab) => (
                        <SidebarTabLink
                          key={tab.id}
                          tab={tab}
                          pathname={highlightPath}
                          navItemId={item.id}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <p className="text-sm font-medium">{userName}</p>
        <p className="text-xs text-muted-foreground">{roleLabel}</p>
        {showImpersonation ? (
          <AdminImpersonationPanel
            targets={impersonationTargets}
            impersonatorName={impersonatorName}
          />
        ) : null}
        {showMobileSwitch ? (
          <ClientModeSwitch target="mobile" className="mt-2" variant="outline" size="sm" />
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          disabled={accountSwitch.confirming}
          onClick={() =>
            accountSwitch.guardAndRun({
              title: "退出登录",
              dirtyMessage:
                "退出登录将关闭所有标签页，其中部分页面可能有未保存的更改，确定继续？关闭后未保存内容将丢失。",
              cleanMessage: "退出登录将关闭所有打开的标签页，确定继续？",
              action: () => {
                void signOut({ callbackUrl: "/login" });
              },
            })
          }
        >
          退出登录
        </Button>
      </div>
      <ConfirmDestructiveDialog
        open={accountSwitch.pendingOpen}
        title={accountSwitch.pendingTitle}
        message={accountSwitch.pendingMessage}
        confirmLabel="仍要退出"
        pending={accountSwitch.confirming}
        onCancel={accountSwitch.cancel}
        onConfirm={() => void accountSwitch.confirm()}
      />
    </aside>
  );
}

export function AppSidebarClient(props: Props) {
  return <AppSidebarInner {...props} />;
}
