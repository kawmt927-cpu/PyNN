"use client";

import { cn } from "@/lib/utils";

export type OpportunityLinkOption = {
  id: string;
  title: string;
  confirmStatus?: "CONFIRMED" | "PENDING_MANAGER" | "REJECTED";
};

type Props = {
  options: OpportunityLinkOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  disabled?: boolean;
  /** 非负责客户：新建/所选待确认商机提示 */
  pendingConfirmHint?: boolean;
};

export function OpportunityLinkPicker({
  options,
  value,
  onChange,
  className,
  disabled = false,
  pendingConfirmHint = false,
}: Props) {
  const unrelatedChecked = options.length > 0 && value.length === 0;
  const selectedPending = options.filter(
    (o) => value.includes(o.id) && o.confirmStatus === "PENDING_MANAGER"
  );
  const showPendingHint = pendingConfirmHint || selectedPending.length > 0;

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
      <div className={cn("space-y-2", className)}>
        <p className="text-sm text-muted-foreground">该客户暂无未签约商机</p>
        {pendingConfirmHint ? (
          <p className="text-xs text-muted-foreground">
            非负责客户：新建商机将待确认，随本次往来一并提交审核。
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {showPendingHint ? (
        <p className="text-xs text-muted-foreground">
          {selectedPending.length > 0
            ? `所选含待确认商机（${selectedPending.map((o) => o.title).join("、")}），将随本次往来一并提交审核。`
            : "非负责客户：新建商机将待确认，随本次往来一并提交审核。"}
        </p>
      ) : null}

      <div className="space-y-2 rounded-md border p-3">
        {options.map((option) => {
          const checked = value.includes(option.id);
          const pending = option.confirmStatus === "PENDING_MANAGER";
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
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span>{option.title}</span>
                {pending ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
                    待确认
                  </span>
                ) : null}
              </span>
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
