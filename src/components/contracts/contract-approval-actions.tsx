"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";

type ApproveAction = (contractId: string) => Promise<ActionResult>;
type RejectAction = (formData: FormData) => Promise<ActionResult>;

type Props = {
  contractId: string;
  onApprove: ApproveAction;
  onReject: RejectAction;
  /** 详情页展示完整说明与操作区 */
  variant?: "inline" | "panel";
};

export function ContractApprovalActions({
  contractId,
  onApprove,
  onReject,
  variant = "inline",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    startTransition(async () => {
      setError(null);
      const result = await onApprove(contractId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReject() {
    const formData = new FormData();
    formData.set("contractId", contractId);
    formData.set("rejectReason", rejectReason);
    startTransition(async () => {
      setError(null);
      const result = await onReject(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRejecting(false);
      setRejectReason("");
      router.refresh();
    });
  }

  if (variant === "panel") {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="font-medium">该合同待审核</p>
        <p className="mt-1">
          审核通过后将标记为「已签署待实施」，可登记回款并计入 KPI。也可前往
          <Link href="/approvals?type=contract" className="mx-1 font-medium text-primary hover:underline">
            审批中心
          </Link>
          统一处理。
        </p>
        {error && <p className="mt-2 text-destructive">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={handleApprove}>
            审核通过
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setRejecting((v) => !v);
              setRejectReason("");
            }}
          >
            驳回
          </Button>
        </div>
        {rejecting && (
          <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
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
                onClick={handleReject}
              >
                确认驳回
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={handleApprove}>
          通过
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setRejecting(true);
            setRejectReason("");
          }}
        >
          驳回
        </Button>
      </div>
      {rejecting && (
        <div className="w-full min-w-[16rem] space-y-2 border-t pt-3">
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
              onClick={handleReject}
            >
              确认驳回
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
