export const WORKSPACE_OPEN_MESSAGE = "crm:workspace-open" as const;
export const WORKSPACE_DIRTY_MESSAGE = "crm:workspace-dirty" as const;
/** 嵌入页「返回列表」：父壳切回列表标签并关闭当前实体标签 */
export const WORKSPACE_BACK_MESSAGE = "crm:workspace-back" as const;
/** 嵌入页内筛选/排序后：只同步父壳标签 href，不强制重载 iframe */
export const WORKSPACE_SYNC_HREF_MESSAGE = "crm:workspace-sync-href" as const;

export type WorkspaceOpenMessage = {
  type: typeof WORKSPACE_OPEN_MESSAGE;
  key: string;
  title: string;
  href: string;
};

export type WorkspaceDirtyMessage = {
  type: typeof WORKSPACE_DIRTY_MESSAGE;
  dirty: boolean;
};

export type WorkspaceBackMessage = {
  type: typeof WORKSPACE_BACK_MESSAGE;
  href: string;
  title: string;
};

export type WorkspaceSyncHrefMessage = {
  type: typeof WORKSPACE_SYNC_HREF_MESSAGE;
  href: string;
};

export function isWorkspaceOpenMessage(data: unknown): data is WorkspaceOpenMessage {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  return (
    row.type === WORKSPACE_OPEN_MESSAGE &&
    typeof row.key === "string" &&
    typeof row.title === "string" &&
    typeof row.href === "string"
  );
}

export function isWorkspaceDirtyMessage(data: unknown): data is WorkspaceDirtyMessage {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  return row.type === WORKSPACE_DIRTY_MESSAGE && typeof row.dirty === "boolean";
}

export function isWorkspaceBackMessage(data: unknown): data is WorkspaceBackMessage {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  return (
    row.type === WORKSPACE_BACK_MESSAGE &&
    typeof row.href === "string" &&
    typeof row.title === "string"
  );
}

export function isWorkspaceSyncHrefMessage(
  data: unknown
): data is WorkspaceSyncHrefMessage {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  return row.type === WORKSPACE_SYNC_HREF_MESSAGE && typeof row.href === "string";
}
