"use client";

import { cn } from "@/lib/utils";
import {
  CUSTOMER_TAG_COLOR_OPTIONS,
  getTagColorLabel,
  normalizeTagColor,
} from "@/lib/customers/tag-colors";

type Props = {
  value: string;
  onChange: (color: string) => void;
  /** 已被其他标签占用的颜色（不含当前 value） */
  usedColors?: string[];
  id?: string;
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function CustomerTagColorPicker({
  value,
  onChange,
  usedColors = [],
  id,
  showLabel = false,
  compact = false,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const normalizedValue = normalizeTagColor(value);
  const usedSet = new Set(usedColors.map((color) => color.toLowerCase()));
  const selectedLabel = showLabel ? getTagColorLabel(normalizedValue) : null;

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className={cn(
          "flex items-center gap-1.5",
          compact ? "mx-auto w-full max-w-[8.5rem]" : "gap-2"
        )}
      >
        <span
          className={cn(
            "shrink-0 rounded-full border border-border/60",
            compact ? "h-3.5 w-3.5" : "h-4 w-4"
          )}
          style={{ backgroundColor: normalizedValue }}
          aria-hidden
        />
        <select
          id={id}
          value={normalizedValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel ?? "标签颜色"}
          className={cn(
            "rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact
              ? "h-8 min-w-0 flex-1 basis-0 px-1.5 py-1"
              : "h-9 min-w-[7rem] px-2 py-1"
          )}
        >
          {CUSTOMER_TAG_COLOR_OPTIONS.map((option) => {
            const taken =
              usedSet.has(option.value.toLowerCase()) &&
              option.value.toLowerCase() !== normalizedValue.toLowerCase();
            return (
              <option key={option.value} value={option.value} disabled={taken}>
                {option.label}
                {taken ? "（已使用）" : ""}
              </option>
            );
          })}
        </select>
      </div>
      {selectedLabel ? (
        <p className="text-xs text-muted-foreground">已选：{selectedLabel}</p>
      ) : null}
    </div>
  );
}
