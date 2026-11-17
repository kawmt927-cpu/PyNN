"use client";

import type { ComponentProps, MouseEvent } from "react";
import Link from "next/link";
import {
  requestOpenWorkspaceTab,
  useWorkspaceTabsOptional,
} from "@/components/workspace/workspace-tabs-context";
import {
  entityTabKey,
  parseEntityFromHref,
  type WorkspaceEntityKind,
} from "@/lib/workspace/tab-keys";

type BaseProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  title: string;
};

/** 功能入口链接：桌面工作区内 openOrFocus；否则普通跳转 */
export function WorkspaceNavLink({
  tabKey,
  href,
  title,
  children,
  onClick,
  ...rest
}: BaseProps & { tabKey: string }) {
  const workspace = useWorkspaceTabsOptional();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (workspace || (typeof window !== "undefined" && window.parent !== window)) {
      e.preventDefault();
      if (workspace) {
        workspace.openOrFocusTab({ key: tabKey, title, href });
      } else {
        requestOpenWorkspaceTab({ key: tabKey, title, href });
      }
    }
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}

/** 客户/商机/合同详情：按实体 ID 去重开标签 */
export function WorkspaceEntityLink({
  kind,
  id,
  href,
  title,
  children,
  onClick,
  ...rest
}: BaseProps & { kind: WorkspaceEntityKind; id: string }) {
  const workspace = useWorkspaceTabsOptional();
  const key = entityTabKey(kind, id);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    const inWorkspace =
      Boolean(workspace) ||
      (typeof window !== "undefined" && window.parent !== window);
    if (!inWorkspace) return;

    e.preventDefault();
    const payload = { key, title, href };
    if (workspace) {
      workspace.openOrFocusTab(payload);
    } else {
      requestOpenWorkspaceTab(payload);
    }
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}

/**
 * 任意可能指向客户/商机/合同的链接：能解析则开实体标签，否则普通跳转。
 * 用于通知、审批混排等 href 不固定的入口。
 */
export function WorkspaceSmartLink({
  href,
  title,
  children,
  onClick,
  ...rest
}: BaseProps) {
  const entity = parseEntityFromHref(href);
  if (entity) {
    return (
      <WorkspaceEntityLink
        kind={entity.kind}
        id={entity.id}
        href={href}
        title={title}
        onClick={onClick}
        {...rest}
      >
        {children}
      </WorkspaceEntityLink>
    );
  }
  return (
    <Link href={href} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
