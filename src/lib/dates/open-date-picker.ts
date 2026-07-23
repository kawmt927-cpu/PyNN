/** 打开原生 date 选择器（优先 showPicker，失败则 focus） */
export function openNativeDatePicker(el: HTMLInputElement | null | undefined) {
  if (!el || el.disabled) return;
  try {
    if (typeof el.showPicker === "function") {
      void el.showPicker();
      return;
    }
  } catch {
    // 非用户手势或浏览器不支持时回退
  }
  el.focus();
}

/**
 * 在开始日期变更后立刻打开结束日期选择器。
 * 须在 change 回调内同步调用，以保留用户手势（showPicker 要求）。
 */
export function openEndDatePickerAfterStartChange(
  endInputId: string,
  options?: { min?: string }
) {
  const endEl = document.getElementById(endInputId) as HTMLInputElement | null;
  if (endEl && options?.min) {
    endEl.min = options.min;
  }
  openNativeDatePicker(endEl);
}
