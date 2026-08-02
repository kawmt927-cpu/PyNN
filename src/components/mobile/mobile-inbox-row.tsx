"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { markNotificationAsRead } from "@/app/(dashboard)/notifications/actions";
import { cn } from "@/lib/utils";

type Props = {
  receiptId: string;
  href: string;
  unread: boolean;
  title: string;
  body: string;
  when: string;
  badge?: string;
};

export function MobileInboxRow({
  receiptId,
  href,
  unread,
  title,
  body,
  when,
  badge,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      if (unread) {
        try {
          await markNotificationAsRead(receiptId);
        } catch {
          // 仍跳转
        }
      }
      router.push(href);
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border bg-card px-3 py-3 text-left shadow-sm active:bg-muted/50",
        unread && "border-amber-300/80 bg-amber-50/50",
        pending && "opacity-70"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {badge ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {badge}
            </span>
          ) : null}
          {unread ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
              未读
            </span>
          ) : null}
          <p className="truncate text-sm font-medium">{title}</p>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
          {body}
        </p>
        <p className="text-[11px] text-muted-foreground">{when}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
