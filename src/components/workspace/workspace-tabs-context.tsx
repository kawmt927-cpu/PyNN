"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isWorkspaceBackMessage,
  isWorkspaceDirtyMessage,
  isWorkspaceOpenMessage,
  isWorkspaceSyncHrefMessage,
  WORKSPACE_BACK_MESSAGE,
  WORKSPACE_OPEN_MESSAGE,
  WORKSPACE_SYNC_HREF_MESSAGE,
  type WorkspaceBackMessage,
  type WorkspaceOpenMessage,
  type WorkspaceSyncHrefMessage,
} from "@/lib/workspace/messages";
import {
  listTabKeyForPath,
  parseEntityFromHref,
  stripEmbedParam,
  withEmbedParam,
} from "@/lib/workspace/tab-keys";

export type WorkspaceTab = {
  key: string;
  title: string;
  /** 业务路径（可含 query，不含 embed） */
  href: string;
};

type OpenInput = {
  key: string;
  title: string;
  href: string;
};

type WorkspaceTabsApi = {
  tabs: WorkspaceTab[];
  activeKey: string | null;
  openOrFocusTab: (input: OpenInput) => void;
  focusTab: (key: string) => void;
  /** 强制关闭（已确认无未保存 / 用户已确认放弃） */
  closeTab: (key: string) => void;
  /** 关闭全部标签（切换账号前调用） */
  closeAllTabs: () => void;
  /**
   * 从实体详情「返回列表」：切到已有列表标签（keep-alive）并关闭当前实体标签。
   * 避免在实体 iframe 内重载重列表页（线上会表现为点击无响应）。
   */
  backToList: (href: string, title: string) => void;
  /** 仅更新当前标签 href（嵌入页内筛选后同步），不强制重载 iframe */
  syncActiveTabHref: (href: string) => void;
  /** 若有未保存改动返回 true，由 UI 弹出确认 */
  isTabDirty: (key: string) => boolean;
  hasAnyDirty: () => boolean;
  registerTabIframe: (key: string, el: HTMLIFrameElement | null) => void;
  activeHref: string | null;
};

const WorkspaceTabsContext = createContext<WorkspaceTabsApi | null>(null);

const STORAGE_KEY = "crm.workspace.tabs.v2";
const MAX_TABS = 12;
const LOCAL_EVENT = "crm:workspace-open-local";
const LOCAL_BACK_EVENT = "crm:workspace-back-local";
const LOCAL_SYNC_HREF_EVENT = "crm:workspace-sync-href-local";

type StoredState = {
  userId: string;
  tabs: WorkspaceTab[];
  activeKey: string | null;
};

function readStored(expectedUserId: string): StoredState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed.tabs)) return null;
    // 换账号后丢弃旧标签，避免串数据
    if (parsed.userId !== expectedUserId) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      userId: expectedUserId,
      tabs: parsed.tabs.filter(
        (t) =>
          t &&
          typeof t.key === "string" &&
          typeof t.title === "string" &&
          typeof t.href === "string"
      ),
      activeKey: typeof parsed.activeKey === "string" ? parsed.activeKey : null,
    };
  } catch {
    return null;
  }
}

function writeStored(state: StoredState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearWorkspaceTabsStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("crm.workspace.tabs.v1");
  } catch {
    // ignore
  }
}

function normalizeHref(href: string): string {
  return stripEmbedParam(href);
}

export function WorkspaceTabsProvider({
  children,
  userId,
}: {
  children: ReactNode;
  /** 当前登录用户；换账号时清空标签 */
  userId: string;
}) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** 已完成 hydrate 的 userId，防止换账号时把旧标签写进新账号 storage */
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const tabsRef = useRef(tabs);
  const activeKeyRef = useRef(activeKey);
  const dirtyKeysRef = useRef(dirtyKeys);
  const iframeRefs = useRef(new Map<string, HTMLIFrameElement>());
  tabsRef.current = tabs;
  activeKeyRef.current = activeKey;
  dirtyKeysRef.current = dirtyKeys;

  useEffect(() => {
    const stored = readStored(userId);
    if (stored && stored.tabs.length > 0) {
      setTabs(stored.tabs);
      setActiveKey(
        stored.activeKey && stored.tabs.some((t) => t.key === stored.activeKey)
          ? stored.activeKey
          : stored.tabs[0]?.key ?? null
      );
    } else {
      setTabs([]);
      setActiveKey(null);
      setDirtyKeys(new Set());
    }
    setOwnerUserId(userId);
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!hydrated || ownerUserId !== userId) return;
    writeStored({ userId, tabs, activeKey });
  }, [tabs, activeKey, hydrated, userId, ownerUserId]);

  /**
   * 只同步浏览器地址栏，不用 router.replace。
   * 父壳 soft nav 在切换标签时容易卡住（返回列表表现为点了没反应）。
   * 侧栏高亮已优先读 activeHref，不依赖 pathname。
   */
  const syncParentUrl = useCallback((href: string) => {
    if (typeof window === "undefined") return;
    const clean = normalizeHref(href);
    const next = clean.startsWith("/") ? clean : `/${clean}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === next) return;
    try {
      window.history.replaceState(window.history.state ?? null, "", next);
    } catch {
      // ignore
    }
  }, []);

  const clearDirty = useCallback((key: string) => {
    setDirtyKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const openOrFocusTab = useCallback(
    (input: OpenInput) => {
      const href = normalizeHref(input.href);
      const key = input.key;
      const prev = tabsRef.current;
      const existing = prev.find((t) => t.key === key);
      // 空 title 表示保留已有标签标题（如详情内「返回」只改路径）
      const title = input.title.trim() || existing?.title || "未命名";

      if (existing) {
        // 同实体再开（如详情 → 跟进）：更新路径并聚焦，iframe 会切到新地址
        if (normalizeHref(existing.href) !== href || existing.title !== title) {
          setTabs((prev) =>
            prev.map((t) => (t.key === key ? { ...t, href, title } : t))
          );
        }
        setActiveKey(key);
        syncParentUrl(href);
        return;
      }

      let next = [...prev, { key, title, href }];
      if (next.length > MAX_TABS) {
        const keepActive = activeKeyRef.current;
        const removable = next.find((t) => t.key !== keepActive && t.key !== key);
        if (removable) {
          next = next.filter((t) => t.key !== removable.key);
          clearDirty(removable.key);
          iframeRefs.current.delete(removable.key);
        } else {
          const dropped = next[0];
          next = next.slice(next.length - MAX_TABS);
          if (dropped) {
            clearDirty(dropped.key);
            iframeRefs.current.delete(dropped.key);
          }
        }
      }
      setTabs(next);
      setActiveKey(key);
      syncParentUrl(href);
    },
    [clearDirty, syncParentUrl]
  );

  const focusTab = useCallback(
    (key: string) => {
      const tab = tabsRef.current.find((t) => t.key === key);
      if (!tab) return;
      setActiveKey(key);
      syncParentUrl(tab.href);
    },
    [syncParentUrl]
  );

  const closeTab = useCallback(
    (key: string) => {
      const prev = tabsRef.current;
      const idx = prev.findIndex((t) => t.key === key);
      if (idx < 0) return;
      const next = prev.filter((t) => t.key !== key);
      setTabs(next);
      clearDirty(key);
      iframeRefs.current.delete(key);

      const current = activeKeyRef.current;
      if (current !== key) {
        const still = next.find((t) => t.key === current);
        if (still) syncParentUrl(still.href);
        return;
      }
      const fallback = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
      setActiveKey(fallback?.key ?? null);
      if (fallback) syncParentUrl(fallback.href);
    },
    [clearDirty, syncParentUrl]
  );

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveKey(null);
    setDirtyKeys(new Set());
    iframeRefs.current.clear();
    clearWorkspaceTabsStorage();
  }, []);

  const syncActiveTabHref = useCallback(
    (href: string) => {
      const targetHref = normalizeHref(href);
      const key = activeKeyRef.current;
      if (!key) return;
      const existing = tabsRef.current.find((t) => t.key === key);
      if (!existing) return;
      if (normalizeHref(existing.href) === targetHref) {
        syncParentUrl(targetHref);
        return;
      }
      setTabs((prev) =>
        prev.map((t) => (t.key === key ? { ...t, href: targetHref } : t))
      );
      syncParentUrl(targetHref);
    },
    [syncParentUrl]
  );

  const backToList = useCallback(
    (href: string, title: string) => {
      const targetHref = normalizeHref(href);
      const targetPath = targetHref.split("?")[0] || targetHref;
      const leavingKey = activeKeyRef.current;
      const prev = tabsRef.current;

      const existing = prev.find((t) => {
        if (parseEntityFromHref(t.href)) return false;
        const path = t.href.split("?")[0] || t.href;
        return path === targetPath;
      });

      let next = [...prev];
      let focusKey: string;

      if (existing) {
        // 不改列表标签 href：保留页内筛选/排序，避免误触发 iframe 重载
        focusKey = existing.key;
      } else {
        // 与侧栏 key 对齐（如 nav:crm:opportunities），避免返回再建一套列表标签
        focusKey = listTabKeyForPath(targetPath);
        next = [
          ...next,
          {
            key: focusKey,
            title: title.trim() || "列表",
            href: targetHref,
          },
        ];
      }

      if (leavingKey && leavingKey !== focusKey) {
        next = next.filter((t) => t.key !== leavingKey);
        clearDirty(leavingKey);
        iframeRefs.current.delete(leavingKey);
      }

      if (next.length > MAX_TABS) {
        const removable = next.find(
          (t) => t.key !== focusKey && t.key !== leavingKey
        );
        if (removable) {
          next = next.filter((t) => t.key !== removable.key);
          clearDirty(removable.key);
          iframeRefs.current.delete(removable.key);
        } else {
          next = next.slice(next.length - MAX_TABS);
        }
      }

      setTabs(next);
      setActiveKey(focusKey);
      syncParentUrl(targetHref);
    },
    [clearDirty, syncParentUrl]
  );

  const isTabDirty = useCallback(
    (key: string) => dirtyKeys.has(key),
    [dirtyKeys]
  );

  const hasAnyDirty = useCallback(() => dirtyKeysRef.current.size > 0, []);

  const registerTabIframe = useCallback((key: string, el: HTMLIFrameElement | null) => {
    if (el) iframeRefs.current.set(key, el);
    else iframeRefs.current.delete(key);
  }, []);

  useEffect(() => {
    function applyOpen(data: WorkspaceOpenMessage) {
      openOrFocusTab({
        key: data.key,
        title: data.title,
        href: data.href,
      });
    }

    function applyBack(data: WorkspaceBackMessage) {
      backToList(data.href, data.title);
    }

    function applySyncHref(data: WorkspaceSyncHrefMessage) {
      syncActiveTabHref(data.href);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      if (isWorkspaceDirtyMessage(event.data)) {
        const dirty = event.data.dirty;
        let matchedKey: string | null = null;
        for (const [key, iframe] of iframeRefs.current) {
          if (iframe.contentWindow === event.source) {
            matchedKey = key;
            break;
          }
        }
        if (!matchedKey) return;
        const key = matchedKey;
        setDirtyKeys((prev) => {
          const next = new Set(prev);
          if (dirty) next.add(key);
          else next.delete(key);
          return next;
        });
        return;
      }

      if (isWorkspaceBackMessage(event.data)) {
        applyBack(event.data);
        return;
      }

      if (isWorkspaceSyncHrefMessage(event.data)) {
        applySyncHref(event.data);
        return;
      }

      if (!isWorkspaceOpenMessage(event.data)) return;
      applyOpen(event.data);
    }

    function onLocalOpen(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!isWorkspaceOpenMessage(detail)) return;
      applyOpen(detail);
    }

    function onLocalBack(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!isWorkspaceBackMessage(detail)) return;
      applyBack(detail);
    }

    function onLocalSyncHref(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!isWorkspaceSyncHrefMessage(detail)) return;
      applySyncHref(detail);
    }

    window.addEventListener("message", onMessage);
    window.addEventListener(LOCAL_EVENT, onLocalOpen);
    window.addEventListener(LOCAL_BACK_EVENT, onLocalBack);
    window.addEventListener(LOCAL_SYNC_HREF_EVENT, onLocalSyncHref);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener(LOCAL_EVENT, onLocalOpen);
      window.removeEventListener(LOCAL_BACK_EVENT, onLocalBack);
      window.removeEventListener(LOCAL_SYNC_HREF_EVENT, onLocalSyncHref);
    };
  }, [openOrFocusTab, backToList, syncActiveTabHref]);

  const activeHref = useMemo(() => {
    if (!activeKey) return null;
    return tabs.find((t) => t.key === activeKey)?.href ?? null;
  }, [tabs, activeKey]);

  const value = useMemo(
    () => ({
      tabs,
      activeKey,
      openOrFocusTab,
      focusTab,
      closeTab,
      closeAllTabs,
      backToList,
      syncActiveTabHref,
      isTabDirty,
      hasAnyDirty,
      registerTabIframe,
      activeHref,
    }),
    [
      tabs,
      activeKey,
      openOrFocusTab,
      focusTab,
      closeTab,
      closeAllTabs,
      backToList,
      syncActiveTabHref,
      isTabDirty,
      hasAnyDirty,
      registerTabIframe,
      activeHref,
    ]
  );

  return (
    <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>
  );
}

export function useWorkspaceTabs(): WorkspaceTabsApi {
  const ctx = useContext(WorkspaceTabsContext);
  if (!ctx) {
    throw new Error("useWorkspaceTabs must be used within WorkspaceTabsProvider");
  }
  return ctx;
}

export function useWorkspaceTabsOptional(): WorkspaceTabsApi | null {
  return useContext(WorkspaceTabsContext);
}

/** 嵌入页或壳内：打开/聚焦标签（父壳优先 postMessage） */
export function requestOpenWorkspaceTab(input: OpenInput) {
  if (typeof window === "undefined") return;
  const payload = {
    type: WORKSPACE_OPEN_MESSAGE,
    key: input.key,
    title: input.title,
    href: normalizeHref(input.href),
  };
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, window.location.origin);
    return;
  }
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: payload }));
}

/** 嵌入页「返回列表」：通知父壳切回列表标签并关闭当前实体页 */
export function requestWorkspaceBackToList(href: string, title: string) {
  if (typeof window === "undefined") return;
  const payload = {
    type: WORKSPACE_BACK_MESSAGE,
    href: normalizeHref(href),
    title: title.trim() || "列表",
  };
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, window.location.origin);
    return;
  }
  window.dispatchEvent(new CustomEvent(LOCAL_BACK_EVENT, { detail: payload }));
}

/** 嵌入页筛选/排序后同步父壳当前标签 href（不强制重载 iframe） */
export function requestWorkspaceSyncHref(href: string) {
  if (typeof window === "undefined") return;
  const payload = {
    type: WORKSPACE_SYNC_HREF_MESSAGE,
    href: normalizeHref(href),
  };
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, window.location.origin);
    return;
  }
  window.dispatchEvent(
    new CustomEvent(LOCAL_SYNC_HREF_EVENT, { detail: payload })
  );
}

export function iframeSrcForTab(href: string): string {
  return withEmbedParam(href);
}
