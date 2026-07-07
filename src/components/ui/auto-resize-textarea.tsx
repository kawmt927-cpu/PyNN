"use client";

import { useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  maxRows?: number;
};

export function AutoResizeTextarea({
  maxRows = 8,
  className,
  value,
  onChange,
  ...props
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "0px";
    const styles = getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const padding =
      Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const border =
      Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * maxRows + padding + border;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);

    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxRows]);

  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      className={cn(
        "min-h-[2.75rem] resize-none py-2.5 leading-normal",
        className
      )}
      {...props}
    />
  );
}
