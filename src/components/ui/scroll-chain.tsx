"use client";

import type { HTMLAttributes, OlHTMLAttributes } from "react";
import { usePropagateWheelAtEdgeRef } from "@/hooks/use-propagate-wheel-at-edge";

/**
 * 带触顶/触底滚轮外传的滚动容器（div）。
 * 用于页面内嵌套的 max-height / flex 滚动窗口，避免滚轮锁死。
 */
export function ScrollChain({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const ref = usePropagateWheelAtEdgeRef<HTMLDivElement>();
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
}

/** 同上，语义为 ul */
export function ScrollChainList({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  const ref = usePropagateWheelAtEdgeRef<HTMLUListElement>();
  return (
    <ul ref={ref} className={className} {...props}>
      {children}
    </ul>
  );
}

/** 同上，语义为 ol */
export function ScrollChainOrderedList({
  className,
  children,
  ...props
}: OlHTMLAttributes<HTMLOListElement>) {
  const ref = usePropagateWheelAtEdgeRef<HTMLOListElement>();
  return (
    <ol ref={ref} className={className} {...props}>
      {children}
    </ol>
  );
}
