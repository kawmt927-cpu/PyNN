"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteRejectedContract } from "@/app/(dashboard)/contracts/actions";
import { markNotificationAsRead } from "@/app/(dashboard)/notifications/actions";

type Props = {
  contractId: string;
  receiptId: string;
  unread: boolean;
};

export function NotificationRejectedContractActions({
  contractId,
  receiptId,
  unread,
}: Props) {
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
      if (unread) {
        await markNotificationAsRead(receiptId);
      }
      router.refresh();
    });
  }

  function handleEdit() {
    startTransition(async () => {
      if (unread) {
        await markNotificationAsRead(receiptId);
      }
      router.push(`/contracts/${contractId}?edit=1`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={handleEdit}>
        {pending ? "处理中…" : "编辑后重新申请"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={handleDelete}
      >
        删除合同
      </Button>
      <Button asChild type="button" size="sm" variant="ghost">
        <Link href={`/contracts/${contractId}`}>查看详情</Link>
      </Button>
    </div>
  );
}
