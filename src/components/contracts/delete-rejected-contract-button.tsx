"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteRejectedContract } from "@/app/(dashboard)/contracts/actions";

type Props = {
  contractId: string;
};

export function DeleteRejectedContractButton({ contractId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("确定删除该已驳回合同？删除后不可恢复。")) return;
    startTransition(async () => {
      const result = await deleteRejectedContract(contractId);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      router.push(result.redirectTo || "/contracts");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleDelete}>
      {pending ? "删除中…" : "删除合同"}
    </Button>
  );
}
