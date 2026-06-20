"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityStatus } from "@prisma/client";
import { restoreOpportunityStatus } from "@/app/(dashboard)/opportunities/actions";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/opportunities/status";
import { Button } from "@/components/ui/button";

type Props = {
  opportunityId: string;
  compact?: boolean;
};

const restoreOptions: OpportunityStatus[] = ["NOT_SIGNED", "SIGNED"];

export function OpportunityRestoreStatusActions({ opportunityId, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRestore(status: OpportunityStatus) {
    const formData = new FormData();
    formData.set("opportunityId", opportunityId);
    formData.set("status", status);

    startTransition(async () => {
      const result = await restoreOpportunityStatus(formData);
      if (result.error) {
        alert(result.error);
        return;
      }
      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  }

  return (
    <div className={compact ? "space-y-1" : "flex flex-wrap gap-2"}>
      {!compact && (
        <p className="mb-2 w-full text-sm text-muted-foreground">
          该商机已放弃，可将状态恢复为未签约或已签约。
        </p>
      )}
      {restoreOptions.map((status) => (
        <Button
          key={status}
          type="button"
          variant={compact ? "ghost" : "outline"}
          size={compact ? "sm" : "default"}
          className={compact ? "w-full justify-start px-2 font-normal" : undefined}
          disabled={pending}
          onClick={() => handleRestore(status)}
        >
          改为{OPPORTUNITY_STATUS_LABELS[status]}
        </Button>
      ))}
    </div>
  );
}
