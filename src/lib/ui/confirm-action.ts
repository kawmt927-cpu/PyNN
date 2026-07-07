/** 破坏性操作前的浏览器确认框 */
export function confirmDestructiveAction(message: string): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(message);
}
