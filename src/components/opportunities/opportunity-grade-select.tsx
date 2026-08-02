"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OpportunityGradeDisplay } from "@/components/opportunities/opportunity-grade-icon";
import {
  getOpportunityGradeLabel,
  getOpportunityGradeOptions,
} from "@/lib/opportunities/grade";
import type { ConfigOptionItem } from "@/lib/config-options";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
  options?: ConfigOptionItem[];
  allowEmpty?: boolean;
  emptyLabel?: string;
};

const triggerClassName =
  "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function resolveGradeOptions(options?: ConfigOptionItem[]): ConfigOptionItem[] {
  if (options?.length) return options;
  return getOpportunityGradeOptions();
}

export function OpportunityGradeSelect({
  id = "grade",
  name = "grade",
  label = "商机等级",
  value,
  defaultValue = "",
  onValueChange,
  required = false,
  className,
  labelClassName,
  disabled,
  options,
  allowEmpty = false,
  emptyLabel = "全部等级",
}: Props) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = controlled ? value : internalValue;
  const displayLabel = required ? `${label} *` : label;
  const gradeOptions = useMemo(() => resolveGradeOptions(options), [options]);
  const labelMap = useMemo(
    () => Object.fromEntries(gradeOptions.map((option) => [option.value, option.label])),
    [gradeOptions]
  );

  function handleSelect(next: string) {
    if (!controlled) setInternalValue(next);
    onValueChange?.(next);
  }

  const selectedDescription = selected ? getOpportunityGradeLabel(selected, labelMap) : null;

  return (
    <div className={cn(allowEmpty ? "space-y-1.5" : "space-y-2", className)}>
      <Label
        htmlFor={id}
        className={cn(
          allowEmpty ? "text-xs font-normal text-muted-foreground" : "block",
          labelClassName
        )}
      >
        {displayLabel}
      </Label>
      {name ? <input type="hidden" name={name} value={selected} required={required} /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={selectedDescription ?? displayLabel}
            className={cn(
              triggerClassName,
              disabled && "cursor-not-allowed bg-muted text-muted-foreground"
            )}
          >
            {selected ? (
              <OpportunityGradeDisplay
                grade={selected}
                description={selectedDescription}
                size="md"
                className="min-w-0 flex-1"
              />
            ) : (
              <span
                className={cn(
                  "truncate",
                  allowEmpty ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {allowEmpty ? emptyLabel : "请选择"}
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          {allowEmpty ? (
            <DropdownMenuItem
              onSelect={() => handleSelect("")}
              className={cn("py-2", !selected && "bg-accent")}
            >
              <span className="text-sm">{emptyLabel}</span>
            </DropdownMenuItem>
          ) : null}
          {gradeOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => handleSelect(option.value)}
              className={cn("py-2", selected === option.value && "bg-accent")}
            >
              <OpportunityGradeDisplay
                grade={option.value}
                description={option.label}
                size="md"
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
