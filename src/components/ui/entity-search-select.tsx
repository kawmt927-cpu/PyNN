"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSameCustomerName } from "@/lib/customers/duplicate-name";
import { cn } from "@/lib/utils";

export type SearchSelectOption = {
  id: string;
  label: string;
  description?: string;
  customerGrade?: string | null;
  disabled?: boolean;
};

export type EntitySearchSelectHandle = {
  getDraftQuery: () => string;
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
  labelClassName?: string;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
  /** 聚焦时即搜索（如已选客户后列出其商机），无需先输入关键字 */
  preloadOnFocus?: boolean;
  /** 已选时可一键清除；默认可选字段（非 required）显示 */
  clearable?: boolean;
};

export const EntitySearchSelect = forwardRef<EntitySearchSelectHandle, Props>(function EntitySearchSelect(
  {
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
    labelClassName,
    onCreateNew,
    createNewLabel = "新增客户",
    preloadOnFocus = false,
    clearable,
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const showClear = (clearable ?? !required) && Boolean(value) && !disabled;

  const showSelected = Boolean(value && selectedLabel && !editing);
  const inputValue = showSelected ? selectedLabel : query;
  const trimmedQuery = query.trim();
  const hasExactMatch = useMemo(
    () =>
      trimmedQuery.length > 0 &&
      options.some(
        (option) => !option.disabled && isSameCustomerName(option.label, trimmedQuery)
      ),
    [options, trimmedQuery]
  );
  const showCreateNew = Boolean(onCreateNew && trimmedQuery && !hasExactMatch);

  useImperativeHandle(
    ref,
    () => ({
      getDraftQuery: () => (editing ? query.trim() : selectedLabel.trim()),
    }),
    [editing, query, selectedLabel]
  );

  const handleCreateNew = useCallback(
    (draft: string) => {
      if (!onCreateNew || !draft) return;
      onCreateNew(draft);
      setOpen(false);
      setEditing(false);
      setQuery("");
    },
    [onCreateNew]
  );

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
    if (!open || !editing) {
      setOptions([]);
      setLoading(false);
      return;
    }

    const shouldSearch = trimmed.length > 0 || preloadOnFocus;
    if (!shouldSearch) {
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
  }, [query, open, editing, onSearch, preloadOnFocus]);

  const handleFocus = useCallback(() => {
    setOpen(true);
    if (value && selectedLabel) {
      setEditing(true);
      setQuery(selectedLabel);
    } else if (preloadOnFocus) {
      setEditing(true);
      setQuery("");
    }
  }, [value, selectedLabel, preloadOnFocus]);

  const handleClick = useCallback(() => {
    if (!preloadOnFocus || disabled) return;
    setOpen(true);
    setEditing(true);
  }, [preloadOnFocus, disabled]);

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
      if (option.disabled) return;
      onValueChange(option.id, option);
      setEditing(false);
      setQuery("");
      setOpen(false);
    },
    [onValueChange]
  );

  const handleClear = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onValueChange("", undefined);
      setEditing(false);
      setQuery("");
      setOpen(false);
    },
    [onValueChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();

      const selectable = options.filter((option) => !option.disabled);
      if (selectable.length === 1) {
        handleSelect(selectable[0]);
        return;
      }

      const exact = selectable.find(
        (option) => trimmedQuery && isSameCustomerName(option.label, trimmedQuery)
      );
      if (exact) {
        handleSelect(exact);
      }
    },
    [handleSelect, options, trimmedQuery]
  );

  return (
    <div ref={rootRef} className={cn("relative", label ? "space-y-2" : "space-y-0", className)}>
      {label ? (
        <Label htmlFor={id} className={labelClassName}>
          {label}
        </Label>
      ) : null}
      <input type="hidden" name={name} value={value} required={required} />
      <div className="relative">
        <Input
          id={id}
          value={inputValue}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          className={cn(showClear && "pr-9")}
          onFocus={handleFocus}
          onClick={handleClick}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {showClear ? (
          <button
            type="button"
            aria-label={`清除${label || "已选内容"}`}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open && editing && (trimmedQuery.length > 0 || preloadOnFocus) && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-md">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">匹配中…</p>
          ) : options.length === 0 ? (
            <div className="py-1">
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {preloadOnFocus && !trimmedQuery ? "该客户暂无可用商机" : "暂无匹配结果"}
              </p>
              {showCreateNew ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleCreateNew(trimmedQuery)}
                >
                  {createNewLabel}「{trimmedQuery}」
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1">
              {options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={option.disabled}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm",
                      option.disabled
                        ? "cursor-not-allowed text-muted-foreground opacity-60"
                        : "hover:bg-muted"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(option)}
                  >
                    <span className={cn("font-medium", option.disabled && "font-normal")}>
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="ml-2 text-muted-foreground">{option.description}</span>
                    )}
                  </button>
                </li>
              ))}
              {showCreateNew ? (
                <li className="border-t">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleCreateNew(trimmedQuery)}
                  >
                    {createNewLabel}「{trimmedQuery}」
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});
