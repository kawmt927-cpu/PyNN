"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onClear: () => void;
  ariaLabel: string;
  className?: string;
};

/** 可选下拉框右侧清除按钮 */
export function SelectClearButton({ value, onClear, ariaLabel, className }: Props) {
  if (!value) return null;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground",
        className
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClear();
      }}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
