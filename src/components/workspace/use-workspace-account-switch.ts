"use client";

import { useCallback, useState } from "react";
import { useWorkspaceTabsOptional } from "@/components/workspace/workspace-tabs-context";

type PendingSwitch = {
  title: string;
  message: string;
  action: () => void | Promise<void>;
};

/**
 * 切换账号 / 退出登录前：若有工作区标签则提示并全部关闭。
 * 无 WorkspaceTabsProvider（如移动端）时直接执行。
 */
export function useWorkspaceAccountSwitch() {
  const workspace = useWorkspaceTabsOptional();
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [confirming, setConfirming] = useState(false);

  const guardAndRun = useCallback(
    (opts: {
      title: string;
      /** 有未保存时的文案；无未保存时用 cleanMessage */
      dirtyMessage: string;
      cleanMessage: string;
      action: () => void | Promise<void>;
    }) => {
      const tabCount = workspace?.tabs.length ?? 0;
      if (!workspace || tabCount === 0) {
        void opts.action();
        return;
      }

      const dirty = workspace.hasAnyDirty();
      setPending({
        title: opts.title,
        message: dirty ? opts.dirtyMessage : opts.cleanMessage,
        action: opts.action,
      });
    },
    [workspace]
  );

  const cancel = useCallback(() => {
    if (confirming) return;
    setPending(null);
  }, [confirming]);

  const confirm = useCallback(async () => {
    if (!pending) return;
    setConfirming(true);
    try {
      workspace?.closeAllTabs();
      await pending.action();
      setPending(null);
    } finally {
      setConfirming(false);
    }
  }, [pending, workspace]);

  return {
    pendingOpen: pending != null,
    pendingTitle: pending?.title ?? "",
    pendingMessage: pending?.message ?? "",
    confirming,
    guardAndRun,
    cancel,
    confirm,
  };
}
