/** 仪表盘主内容区（非 window）滚动容器；嵌入标签页时为 EmbedShell 滚动层 */
export function getDashboardMainEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector("[data-workspace-embed-scroll]") ??
    document.querySelector("main.min-h-0.flex-1.overflow-y-auto")
  );
}

/**
 * 在 router 导航前后保住滚动位置。
 * 软导航后节点可能重建，restore 时重新 query，并多拍几次以覆盖 RSC 替换时机。
 */
export function withPreservedMainScroll(action: () => void) {
  const top = getDashboardMainEl()?.scrollTop ?? 0;

  action();

  const restore = () => {
    const el = getDashboardMainEl();
    if (el && el.scrollTop !== top) {
      el.scrollTop = top;
    }
  };

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  for (const ms of [50, 100, 200, 400, 800, 1200]) {
    window.setTimeout(restore, ms);
  }
}
