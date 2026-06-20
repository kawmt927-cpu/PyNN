"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SearchSelectOption = {
  id: string;
  label: string;
  description?: string;
};

type Props = {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  selectedLabel: string;
  onValueChange: (value: string, option?: SearchSelectOption) => void;
  onSearch: (query: string) => Promise<SearchSelectOption[]>;
  disabled?: boolean;
  className?: string;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
};

export function EntitySearchSelect({
  id,
  name,
  label,
  required,
  placeholder = "输入关键字搜索…",
  value,
  selectedLabel,
  onValueChange,
  onSearch,
  disabled,
  className,
  onCreateNew,
  createNewLabel = "新增客户",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const showSelected = Boolean(value && selectedLabel && !editing);
  const inputValue = showSelected ? selectedLabel : query;

  useEffect(() => {
    if (!editing) {
      setQuery("");
    }
  }, [value, selectedLabel, editing]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (value && selectedLabel) {
          setEditing(false);
        }
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [value, selectedLabel]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || !editing || !trimmed) {
      setOptions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const items = await onSearch(trimmed);
        setOptions(items);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [query, open, editing, onSearch]);

  const handleFocus = useCallback(() => {
    setOpen(true);
    if (value && selectedLabel) {
      setEditing(true);
      setQuery(selectedLabel);
    }
  }, [value, selectedLabel]);

  const handleChange = useCallback(
    (next: string) => {
      setEditing(true);
      setQuery(next);
      setOpen(true);
      if (value) {
        onValueChange("", undefined);
      }
    },
    [onValueChange, value]
  );

  const handleSelect = useCallback(
    (option: SearchSelectOption) => {
      onValueChange(option.id, option);
      setEditing(false);
      setQuery("");
      setOpen(false);
    },
    [onValueChange]
  );

  return (
    <div ref={rootRef} className={cn("relative space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value} required={required} />
      <Input
        id={id}
        value={inputValue}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        onFocus={handleFocus}
        onChange={(e) => handleChange(e.target.value)}
      />
      {open && editing && query.trim().length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-md">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">匹配中…</p>
          ) : options.length === 0 ? (
            <div className="py-1">
              <p className="px-3 py-2 text-sm text-muted-foreground">暂无匹配结果</p>
              {onCreateNew && query.trim() ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onCreateNew(query.trim());
                    setOpen(false);
                    setEditing(false);
                  }}
                >
                  {createNewLabel}「{query.trim()}」
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1">
              {options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(option)}
                  >
                    <span className="font-medium">{option.label}</span>
                    {option.description && (
                      <span className="ml-2 text-muted-foreground">{option.description}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
