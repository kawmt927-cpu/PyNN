"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const triggerClassName =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Option = { value: string; label: string };

type Props = {
  id: string;
  label?: string;
  options: Option[];
  value: string[];
  onChange: (values: string[]) => void;
  /** 紧凑模式：无标签，适合顶栏 */
  compact?: boolean;
};

function buildSummary(value: string[], options: Option[]) {
  if (value.length === 0) return "全部项目";
  if (value.length === 1) {
    return options.find((option) => option.value === value[0])?.label ?? "已选 1 个";
  }
  return `已选 ${value.length} 个项目`;
}

export function ScheduleProjectMultiSelect({
  id,
  label = "项目范围",
  options,
  value,
  onChange,
  compact = false,
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

  function toggle(projectId: string) {
    const next = new Set(selected);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    onChange([...next]);
  }

  function selectAll() {
    onChange([]);
  }

  if (options.length === 0) {
    return (
      <div className={cn(!compact && "space-y-1")}>
        {!compact ? (
          <Label htmlFor={id} className="block text-xs text-muted-foreground">
            {label}
          </Label>
        ) : null}
        <p className="flex h-8 items-center text-xs text-muted-foreground">暂无项目</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", !compact && "space-y-1")}>
      {!compact ? (
        <Label htmlFor={id} className="block text-xs text-muted-foreground">
          {label}
          <span className="ml-1 font-normal">（可多选）</span>
        </Label>
      ) : null}
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={summary}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(triggerClassName, "h-8 text-xs")}
      >
        <span className="truncate text-left">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          aria-label={label}
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-md"
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value.length === 0}
                onClick={selectAll}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                  value.length === 0 && "bg-muted/60"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                    value.length === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input"
                  )}
                  aria-hidden
                >
                  {value.length === 0 ? "✓" : ""}
                </span>
                全部项目
              </button>
            </li>
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
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      )}
                      aria-hidden
                    >
                      {active ? "✓" : ""}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
