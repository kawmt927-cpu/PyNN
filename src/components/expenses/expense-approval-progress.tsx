import { format } from "date-fns";
import { cn } from "@/lib/utils";

export type ApprovalProgressNode = {
  key: string;
  title: string;
  state: "done" | "current" | "upcoming" | "rejected";
  detail?: string | null;
};

type Props = {
  nodes: ApprovalProgressNode[];
  className?: string;
};

export function ExpenseApprovalProgress({ nodes, className }: Props) {
  if (nodes.length === 0) return null;
  return (
    <aside className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">审批进度</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          共 {nodes.length} 个节点
        </p>
      </div>
      <ol className="space-y-4">
        {nodes.map((node, index) => {
          const isLast = index === nodes.length - 1;
          return (
            <li key={node.key} className="relative flex gap-3">
              {!isLast ? (
                <span
                  className="absolute left-[7px] top-4 h-[calc(100%-4px)] w-px bg-border"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-[1] mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                  node.state === "done" && "border-emerald-500 bg-emerald-500",
                  node.state === "current" && "border-primary bg-primary",
                  node.state === "rejected" && "border-destructive bg-destructive",
                  node.state === "upcoming" && "border-muted-foreground/40 bg-background"
                )}
              />
              <div className="min-w-0 flex-1 pb-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    node.state === "current" && "text-primary",
                    node.state === "rejected" && "text-destructive",
                    node.state === "upcoming" && "text-muted-foreground"
                  )}
                >
                  {node.title}
                </p>
                {node.detail ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {node.detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export function formatApprovalActorDetail(input: {
  at?: Date | null;
  actorName?: string | null;
  comment?: string | null;
  suffix?: string | null;
}) {
  const parts: string[] = [];
  if (input.at) parts.push(format(input.at, "MM-dd HH:mm"));
  if (input.actorName?.trim()) parts.push(input.actorName.trim());
  if (input.suffix?.trim()) parts.push(input.suffix.trim());
  if (input.comment?.trim()) parts.push(input.comment.trim());
  return parts.length > 0 ? parts.join(" · ") : null;
}
