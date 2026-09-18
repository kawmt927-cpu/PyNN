"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type RefCallback,
  type RefObject,
} from "react";

function canScrollY(el: HTMLElement) {
  const { overflowY } = getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
    return false;
  }
  return el.scrollHeight > el.clientHeight + 1;
}

/** 在嵌套滚动触顶/触底时，把滚轮继续传给外层可滚动祖先（避免滚轮被「锁死」）。 */
export function attachPropagateWheelAtEdge(el: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const eps = 1;
    const atTop = scrollTop <= eps;
    const atBottom = scrollTop + clientHeight >= scrollHeight - eps;
    if (event.deltaY < 0 && !atTop) return;
    if (event.deltaY > 0 && !atBottom) return;
    if (event.deltaY === 0) return;

    let node: HTMLElement | null = el.parentElement;
    while (node) {
      if (canScrollY(node)) {
        const before = node.scrollTop;
        node.scrollTop += event.deltaY;
        if (node.scrollTop !== before) {
          event.preventDefault();
          return;
        }
      }
      node = node.parentElement;
    }
  };

  el.addEventListener("wheel", onWheel, { passive: false });
  return () => el.removeEventListener("wheel", onWheel);
}

/**
 * callback ref：适合条件渲染的滚动容器。
 * 用法：`<div ref={usePropagateWheelAtEdgeRef()} className="overflow-auto">`
 */
export function usePropagateWheelAtEdgeRef<
  T extends HTMLElement = HTMLElement,
>(): RefCallback<T> {
  const cleanupRef = useRef<(() => void) | null>(null);
  return useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;
    cleanupRef.current = attachPropagateWheelAtEdge(node);
  }, []);
}

/**
 * 兼容已有 useRef（元素须在挂载时存在）。
 * 条件渲染请改用 usePropagateWheelAtEdgeRef，或与现有 ref 合并：
 * `ref={(el) => { myRef.current = el; chainRef(el); }}`
 */
export function usePropagateWheelAtEdge(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachPropagateWheelAtEdge(el);
  }, [ref]);
}
