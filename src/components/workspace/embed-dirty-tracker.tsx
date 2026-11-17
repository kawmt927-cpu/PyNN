"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { WORKSPACE_DIRTY_MESSAGE } from "@/lib/workspace/messages";

function notifyParent(dirty: boolean) {
  if (typeof window === "undefined") return;
  if (!window.parent || window.parent === window) return;
  window.parent.postMessage(
    { type: WORKSPACE_DIRTY_MESSAGE, dirty },
    window.location.origin
  );
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target.closest("[data-workspace-ignore-dirty]")) return true;
  const tag = target.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !target.isContentEditable) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    const type = (target.type || "text").toLowerCase();
    if (
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      type === "hidden" ||
      type === "button" ||
      type === "submit" ||
      type === "reset"
    ) {
      // checkbox/radio 仍算编辑；file 也算；button 不算
      if (type === "button" || type === "submit" || type === "reset" || type === "hidden") {
        return true;
      }
    }
  }
  // 列表筛选用的 form 可标 ignore；未标注的搜索框也尽量忽略纯 GET 筛选
  const form = target.closest("form");
  if (form?.getAttribute("data-workspace-ignore-dirty") != null) return true;
  if (form?.getAttribute("method")?.toLowerCase() === "get") return true;
  return false;
}

/**
 * 嵌入页：监听表单编辑，向父壳上报 dirty，供关标签前提示。
 * 路由变化时重置。
 */
export function EmbedDirtyTracker() {
  const pathname = usePathname();
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = false;
    notifyParent(false);
  }, [pathname]);

  useEffect(() => {
    function markDirty(event: Event) {
      if (shouldIgnoreTarget(event.target)) return;
      if (dirtyRef.current) return;
      dirtyRef.current = true;
      notifyParent(true);
    }

    function onSubmit() {
      // 提交后先清脏；若校验失败用户继续改会再标脏
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      notifyParent(false);
    }

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return null;
}
