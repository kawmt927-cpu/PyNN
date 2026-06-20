"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreOpportunityStatus } from "@/app/(dashboard)/opportunities/actions";
import { Button } from "@/components/ui/button";

type Props = {
  opportunityId: string;
  compact?: boolean;
};

export function OpportunityRestoreStatusActions({ opportunityId, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRestore() {
    const formData = new FormData();
    formData.set("opportunityId", opportunityId);

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
          该商机已放弃，可恢复为未签约状态。已签约须通过签订销售合同自动设置。
        </p>
      )}
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "default"}
        className={compact ? "w-full justify-start px-2 font-normal" : undefined}
        disabled={pending}
        onClick={handleRestore}
      >
        恢复为未签约
      </Button>
    </div>
  );
}
