"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SelectFieldOptionTone = "project-start" | "project-end" | "duration" | "phase" | "milestone";

export type ToneSelectOption = {
  value: string;
  label: string;
  tone?: SelectFieldOptionTone;
};

export const TONE_OPTION_CLASS: Record<SelectFieldOptionTone, string> = {
  "project-start": "text-blue-700 font-semibold dark:text-blue-400",
  "project-end": "text-violet-700 font-semibold dark:text-violet-400",
  duration: "text-emerald-700 font-semibold dark:text-emerald-400",
  phase: "text-foreground",
  milestone: "text-amber-700 font-semibold dark:text-amber-400",
};

type Option = ToneSelectOption;

type Props = {
  id: string;
  label: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
  /** 控件下方说明文字（与 FORM_GRID_CELL 两行布局兼容） */
  description?: string;
};

export function ToneSelect({
  id,
  name,
  value,
  disabled,
  options,
  size = "default",
  required,
  onValueChange,
}: {
  id?: string;
  name?: string;
  value: string;
  disabled?: boolean;
  options: ToneSelectOption[];
  size?: "default" | "sm";
  required?: boolean;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            size === "sm" ? "h-8 px-2 text-sm" : "h-10 px-3 text-sm",
            disabled
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-background hover:bg-muted/30",
            selected?.tone ? TONE_OPTION_CLASS[selected.tone] : "text-foreground"
          )}
        >
          <span className="truncate text-left">{selected?.label ?? "请选择"}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      {name ? (
        <input type="hidden" name={name} value={value} required={required && !value} />
      ) : null}
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={false}
        className="z-[60] w-[var(--radix-popover-trigger-width)] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ul role="listbox" className="max-h-60 overflow-y-auto overscroll-contain">
          {options.map((opt) => (
            <li key={opt.value || "__empty"}>
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className={cn(
                  "flex w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-muted",
                  value === opt.value && "bg-muted/70",
                  opt.tone ? TONE_OPTION_CLASS[opt.tone] : "text-foreground"
                )}
                onClick={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function SelectField({
  id,
  label,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  required,
  className,
  labelClassName,
  disabled,
  description,
}: Props) {
  const controlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const current = controlled ? value : uncontrolled;

  function handleChange(next: string) {
    if (!controlled) setUncontrolled(next);
    onValueChange?.(next);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className={cn("block min-h-5 leading-5", labelClassName)}>
        {label}
      </Label>
      <div className="min-w-0 space-y-1">
        <ToneSelect
          id={id}
          name={name}
          value={current}
          disabled={disabled}
          options={options}
          required={required}
          onValueChange={handleChange}
        />
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
