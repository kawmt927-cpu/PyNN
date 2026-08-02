"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const triggerClassName =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Option = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  options: Option[];
  value: string[];
  onChange: (values: string[]) => void;
  emptyLabel: string;
  renderOptionLabel?: (option: Option) => ReactNode;
};

function buildSummary(value: string[], options: Option[], emptyLabel: string) {
  if (value.length === 0) return emptyLabel;
  if (value.length === 1) {
    return options.find((option) => option.value === value[0])?.label ?? "已选 1 项";
  }
  return `已选 ${value.length} 项`;
}

function sameValues(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((item, index) => item === right[index]);
}

export function OpportunityMultiFilterSelect({
  id,
  label,
  options,
  value,
  onChange,
  emptyLabel,
  renderOptionLabel,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** 展开期间本地勾选，关闭时再提交，避免每点一次就整页刷新/跳动 */
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  draftRef.current = draft;
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  function commit(next: string[]) {
    if (!sameValues(next, valueRef.current)) onChangeRef.current(next);
  }

  function closeAndCommit(next = draftRef.current) {
    setOpen(false);
    commit(next);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeAndCommit(draftRef.current);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function toggle(optionValue: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(optionValue)) next.delete(optionValue);
      else next.add(optionValue);
      return [...next];
    });
  }

  const summary = buildSummary(open ? draft : value, options, emptyLabel);
  const selected = new Set(open ? draft : value);

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
        onClick={() => {
          if (open) closeAndCommit();
          else {
            setDraft(value);
            setOpen(true);
          }
        }}
        className={cn(
          triggerClassName,
          (open ? draft : value).length > 0 && "text-foreground"
        )}
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
                    onMouseDown={(event) => {
                      // 防止 mousedown 冒泡到 document 先关闭再点选失败
                      event.preventDefault();
                      event.stopPropagation();
                    }}
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
                    {renderOptionLabel ? (
                      renderOptionLabel(option)
                    ) : (
                      <span className="truncate">{option.label}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {draft.length > 0 ? (
            <div className="border-t px-3 py-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={() => {
                  setDraft([]);
                  closeAndCommit([]);
                }}
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
