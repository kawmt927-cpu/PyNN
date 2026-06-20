"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CustomerTagDefinition } from "@/lib/customers/tags";
import { CustomerTagBadge } from "@/components/customers/customer-tag-badge";

const triggerClassName =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  id: string;
  label?: string;
  options: CustomerTagDefinition[];
  value: string[];
  onChange: (values: string[]) => void;
};

function buildSummary(value: string[], options: CustomerTagDefinition[]) {
  if (value.length === 0) return "全部标签";
  if (value.length === 1) {
    return options.find((option) => option.value === value[0])?.label ?? "已选 1 个";
  }
  return `已选 ${value.length} 个`;
}

export function CustomerTagFilterSelect({
  id,
  label = "标签",
  options,
  value,
  onChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const summary = buildSummary(value, options);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function toggle(tagValue: string) {
    const next = new Set(selected);
    if (next.has(tagValue)) next.delete(tagValue);
    else next.add(tagValue);
    onChange([...next]);
  }

  if (options.length === 0) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <p className="flex h-10 items-center text-sm text-muted-foreground">暂无标签</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(triggerClassName, value.length > 0 && "text-foreground")}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          aria-label={label}
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-md"
        >
          <ul className="max-h-56 overflow-y-auto py-1">
            {options.map((option) => {
              const active = selected.has(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggle(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      active && "bg-muted/60"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      )}
                      aria-hidden
                    >
                      {active ? "✓" : ""}
                    </span>
                    <CustomerTagBadge
                      label={option.label}
                      color={option.color}
                      textColor={option.textColor}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          {value.length > 0 ? (
            <div className="border-t px-3 py-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange([])}
              >
                清除已选
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
