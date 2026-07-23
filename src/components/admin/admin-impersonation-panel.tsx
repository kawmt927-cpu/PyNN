"use client";

import { useState, useTransition } from "react";
import {
  startImpersonation,
  stopImpersonation,
} from "@/app/(dashboard)/admin/impersonation-actions";
import { Button } from "@/components/ui/button";
import { ActionErrorDisplay } from "@/components/ui/action-error-display";
import type { ImpersonationTarget } from "@/lib/auth/impersonation";
import {
  rethrowIfNextRedirect,
  toUserFacingActionError,
  type UserFacingActionError,
} from "@/lib/action-result";

type Props = {
  targets: ImpersonationTarget[];
  impersonatorName?: string | null;
};

export function AdminImpersonationPanel({ targets, impersonatorName }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<UserFacingActionError | null>(null);

  function runAction(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        rethrowIfNextRedirect(e);
        setError(toUserFacingActionError(e, "操作失败，请刷新后重试"));
      }
    });
  }

  if (impersonatorName) {
    return (
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
        <p className="font-medium">已切换账号</p>
        <p className="mt-0.5 text-amber-800/90">原账号：{impersonatorName}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full text-xs"
          disabled={pending}
          onClick={() => runAction(() => stopImpersonation())}
        >
          {pending ? "处理中…" : "退出切换，回到原账号"}
        </Button>
        <ActionErrorDisplay error={error} size="xs" className="mt-1.5" />
      </div>
    );
  }

  if (targets.length === 0) return null;

  return (
    <div className="mt-3 max-h-56 overflow-y-auto rounded-md border bg-muted/40 p-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">切换账号查看</p>
      <ul className="space-y-0.5">
        {targets.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              disabled={pending}
              className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-background disabled:opacity-50"
              onClick={() => {
                const formData = new FormData();
                formData.set("userId", u.id);
                runAction(() => startImpersonation(formData));
              }}
            >
              <span className="truncate font-medium">{u.name}</span>
              <span className="shrink-0 text-muted-foreground">{u.roleLabel}</span>
            </button>
          </li>
        ))}
      </ul>
      <ActionErrorDisplay error={error} size="xs" className="mt-1.5" />
    </div>
  );
}
