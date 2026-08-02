/** 仪表盘主内容区（非 window）滚动容器 */
export function getDashboardMainEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("main.min-h-0.flex-1.overflow-y-auto");
}

/** 在 router 导航前后保住 main 的 scrollTop，避免筛选/排序时跳回顶部 */
export function withPreservedMainScroll(action: () => void) {
  const main = getDashboardMainEl();
  const top = main?.scrollTop ?? 0;

  action();

  const restore = () => {
    if (main && main.scrollTop !== top) {
      main.scrollTop = top;
    }
  };

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 50);
  window.setTimeout(restore, 200);
}
