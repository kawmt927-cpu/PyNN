"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { withPreservedMainScroll } from "@/lib/ui/preserve-main-scroll";
import { navigateListInWorkspaceTab } from "@/lib/workspace/navigate-in-tab";

/**
 * 筛选导航：单飞 + 只保留最后一次，避免连点叠多个 soft nav 卡死。
 * clearDeps 在服务端带回新筛选后解除 busy。
 */
export function useListNavigate(clearDeps: unknown[] = []) {
  const router = useRouter();
  const busyRef = useRef(false);
  const queuedRef = useRef<string | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    busyRef.current = false;
    queuedRef.current = null;
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 由调用方传入筛选就绪信号
  }, clearDeps);

  const flush = useCallback(
    (href: string) => {
      busyRef.current = true;
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = setTimeout(() => {
        busyRef.current = false;
        safetyTimerRef.current = null;
        if (queuedRef.current) {
          const next = queuedRef.current;
          queuedRef.current = null;
          flush(next);
        }
      }, 6000);

      withPreservedMainScroll(() => {
        navigateListInWorkspaceTab(href, router);
      });
    },
    [router]
  );

  const navigate = useCallback(
    (href: string) => {
      if (busyRef.current) {
        queuedRef.current = href;
        return;
      }
      flush(href);
    },
    [flush]
  );

  return { navigate };
}
