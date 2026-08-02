"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createExpenseClaimDraft } from "@/app/(dashboard)/expenses/actions";

export function CreateExpenseClaimButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", "报销申请");
      const result = await createExpenseClaimDraft(fd);
      if (result.error || !result.id) {
        window.alert(result.error ?? "创建失败");
        return;
      }
      router.push(`/expenses/${result.id}`);
    });
  }

  return (
    <Button type="button" disabled={pending} onClick={handleClick}>
      {pending ? "创建中…" : "新建报销"}
    </Button>
  );
}
