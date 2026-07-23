import { cn } from "@/lib/utils";
import type { UserFacingActionError } from "@/lib/action-result";

type Props = {
  error: UserFacingActionError | string | null | undefined;
  className?: string;
  /** 默认 text-sm；侧栏等窄区域可用 text-xs */
  size?: "sm" | "xs";
};

/** 中文错误提示 + 可选原始错误（便于调试） */
export function ActionErrorDisplay({ error, className, size = "sm" }: Props) {
  if (!error) return null;

  const message = typeof error === "string" ? error : error.message;
  const detail = typeof error === "string" ? null : error.detail;
  if (!message) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <p className={cn("text-destructive", size === "xs" ? "text-xs" : "text-sm")}>{message}</p>
      {detail ? (
        <p
          className={cn(
            "break-all font-mono text-muted-foreground",
            size === "xs" ? "text-[10px] leading-snug" : "text-[11px] leading-snug"
          )}
          title={detail}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}
