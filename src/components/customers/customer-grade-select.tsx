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
import {
  CustomerGradeDisplay,
} from "@/components/customers/customer-grade-icon";
import { CUSTOMER_GRADE_OPTIONS, getCustomerGradeLabel } from "@/lib/customers/grade";
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
  /** 系统配置中的等级选项（含文字描述） */
  options?: ConfigOptionItem[];
};

function resolveGradeOptions(options?: ConfigOptionItem[]): ConfigOptionItem[] {
  if (options?.length) return options;
  return CUSTOMER_GRADE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

export function CustomerGradeSelect({
  id = "customerGrade",
  name = "customerGrade",
  label = "客户等级",
  value,
  defaultValue = "",
  onValueChange,
  required = false,
  className,
  labelClassName,
  disabled,
  options,
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

  const selectedDescription = selected ? getCustomerGradeLabel(selected, labelMap) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className={cn("block", labelClassName)}>
        {displayLabel}
      </Label>
      <input type="hidden" name={name} value={selected} required={required} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={selectedDescription ?? displayLabel}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-background"
            )}
          >
            {selected ? (
              <CustomerGradeDisplay
                grade={selected}
                description={selectedDescription}
                size="md"
                className="min-w-0 flex-1"
              />
            ) : (
              <span className="text-muted-foreground">请选择</span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          {gradeOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => handleSelect(option.value)}
              className={cn("py-2", selected === option.value && "bg-accent")}
            >
              <CustomerGradeDisplay grade={option.value} description={option.label} size="md" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
