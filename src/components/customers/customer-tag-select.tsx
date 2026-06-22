"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CustomerTagDefinition } from "@/lib/customers/tags";
import { CustomerTagBadge } from "@/components/customers/customer-tag-badge";

type Props = {
  id?: string;
  label?: string;
  name?: string;
  options: CustomerTagDefinition[];
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (values: string[]) => void;
  className?: string;
  labelClassName?: string;
};

export function CustomerTagSelect({
  id = "customerTags",
  label = "客户标签",
  name = "tagValues",
  options,
  value,
  defaultValue = [],
  onValueChange,
  className,
  labelClassName,
}: Props) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);

  useEffect(() => {
    if (!isControlled) setInternalValue(defaultValue);
  }, [defaultValue, isControlled]);

  const selected = new Set(isControlled ? value : internalValue);

  function toggle(tagValue: string) {
    const next = new Set(selected);
    if (next.has(tagValue)) next.delete(tagValue);
    else next.add(tagValue);
    const values = [...next];
    if (!isControlled) setInternalValue(values);
    onValueChange?.(values);
  }

  if (options.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        {label ? (
          <Label className={labelClassName}>{label}</Label>
        ) : null}
        <p className="text-sm text-muted-foreground">暂无可用标签，请管理员在系统配置中维护。</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <Label id={id} className={labelClassName}>
          {label}
        </Label>
      ) : null}
      <div className="flex min-h-10 flex-wrap items-center gap-2" role="group" aria-labelledby={id}>
        {options.map((option) => {
          const active = selected.has(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "inline-flex cursor-pointer items-center rounded-full border px-1 py-1 transition-colors",
                active ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
              )}
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={active}
                className="sr-only"
                onChange={() => toggle(option.value)}
              />
              <CustomerTagBadge
                label={option.label}
                color={option.color}
                textColor={option.textColor}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
