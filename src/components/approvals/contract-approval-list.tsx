"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveContract, rejectContract } from "@/app/(dashboard)/contracts/actions";
import { formatAmount } from "@/lib/opportunities/funnel";

export type ContractApprovalItem = {
  id: string;
  title: string;
  contractNo: string | null;
  totalAmount: number;
  submittedAt: string | null;
  signedAt: string | null;
  owner: { name: string };
  signCustomer: { name: string };
  submittedBy: { name: string } | null;
};

type Props = {
  items: ContractApprovalItem[];
  showActions?: boolean;
};

export function ContractApprovalList({ items, showActions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无记录。</p>;
  }

  function handleApprove(contractId: string) {
    startTransition(async () => {
      setError(null);
      const result = await approveContract(contractId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReject(contractId: string) {
    const formData = new FormData();
    formData.set("contractId", contractId);
    formData.set("rejectReason", rejectReason);
    startTransition(async () => {
      setError(null);
      const result = await rejectContract(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRejectingId(null);
      setRejectReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">
                <Link href={`/contracts/${item.id}`} className="text-primary hover:underline">
                  {item.title}
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                签约客户：{item.signCustomer.name} · 负责销售：{item.owner.name}
              </p>
              <p className="text-sm text-muted-foreground">
                提交人：{item.submittedBy?.name ?? "—"} · 金额：{formatAmount(item.totalAmount)}
              </p>
              {item.signedAt && (
                <p className="text-sm text-muted-foreground">签约日期：{item.signedAt.slice(0, 10)}</p>
              )}
            </div>
            {showActions && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => handleApprove(item.id)}
                >
                  通过
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setRejectingId(item.id);
                    setRejectReason("");
                  }}
                >
                  驳回
                </Button>
              </div>
            )}
          </div>
          {showActions && rejectingId === item.id && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <Textarea
                placeholder="驳回原因（必填）"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending || !rejectReason.trim()}
                  onClick={() => handleReject(item.id)}
                >
                  确认驳回
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
