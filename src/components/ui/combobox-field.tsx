"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
};

export function ComboboxField({
  id,
  label,
  name,
  options,
  defaultValue = "",
  value,
  onValueChange,
  placeholder,
  required,
  className,
  labelClassName,
  disabled,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [showAllPresets, setShowAllPresets] = useState(false);

  const currentValue = controlled ? value : internalValue;

  function updateValue(next: string) {
    if (!controlled) setInternalValue(next);
    onValueChange?.(next);
  }

  function selectPreset(next: string) {
    updateValue(next);
    setOpen(false);
  }

  useEffect(() => {
    if (!controlled) setInternalValue(defaultValue);
  }, [defaultValue, controlled]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const trimmed = currentValue.trim();
  const filteredOptions =
    trimmed.length > 0
      ? options.filter((opt) => opt.label.toLowerCase().includes(trimmed.toLowerCase()))
      : options;
  const displayOptions = showAllPresets || !trimmed ? options : filteredOptions;

  function openWithFilter() {
    setShowAllPresets(false);
    setOpen(true);
  }

  function openAllPresets() {
    setShowAllPresets(true);
    setOpen(true);
  }

  return (
    <div ref={rootRef} className={cn("relative space-y-2", className)}>
      <Label htmlFor={id} className={cn("flex min-h-9 items-center", labelClassName)}>
        {label}
      </Label>
      <input type="hidden" name={name} value={currentValue} />
      <div className="relative flex">
        <Input
          id={id}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={currentValue}
          onChange={(e) => {
            updateValue(e.target.value);
            if (!disabled && options.length > 0) openWithFilter();
          }}
          className="rounded-r-none pr-2"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || options.length === 0}
          aria-label={`选择${label}预设选项`}
          aria-expanded={open}
          aria-controls={`${id}-preset-list`}
          onClick={() => {
            if (open && showAllPresets) {
              setOpen(false);
            } else {
              openAllPresets();
            }
          }}
          className={cn(
            "inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-r-md border border-l-0 border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && displayOptions.length > 0 ? (
        <ul
          id={`${id}-preset-list`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-background py-1 shadow-md"
        >
          {displayOptions.map((opt) => (
            <li key={opt.value} role="option" aria-selected={currentValue === opt.label}>
              <button
                type="button"
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm hover:bg-muted",
                  currentValue === opt.label && "bg-muted/60 font-medium"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPreset(opt.label)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
