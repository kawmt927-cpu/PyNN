"use client";

import { cn } from "@/lib/utils";

type Props = {
  options: { id: string; title: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  disabled?: boolean;
};

export function OpportunityLinkPicker({
  options,
  value,
  onChange,
  className,
  disabled = false,
}: Props) {
  const unrelatedChecked = options.length > 0 && value.length === 0;

  function toggleOpportunity(id: string, checked: boolean) {
    if (checked) {
      onChange([...new Set([...value, id])]);
      return;
    }
    onChange(value.filter((item) => item !== id));
  }

  function setUnrelated(checked: boolean) {
    if (checked) onChange([]);
  }

  if (options.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        该客户暂无未签约商机
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2 rounded-md border p-3">
        {options.map((option) => {
          const checked = value.includes(option.id);
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-2 text-sm",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked}
                disabled={disabled}
                onChange={(e) => toggleOpportunity(option.id, e.target.checked)}
              />
              <span>{option.title}</span>
            </label>
          );
        })}
      </div>

      <label
        className={cn(
          "flex cursor-pointer items-start gap-2 text-sm text-muted-foreground",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={unrelatedChecked}
          disabled={disabled}
          onChange={(e) => setUnrelated(e.target.checked)}
        />
        <span>此次拜访与商机无关</span>
      </label>

      {value.length > 0 ? (
        <p className="text-xs text-muted-foreground">已关联商机时须填写下次拜访时间</p>
      ) : null}
    </div>
  );
}
