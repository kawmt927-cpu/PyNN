"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityAbandonReason } from "@prisma/client";
import { abandonOpportunity } from "@/app/(dashboard)/opportunities/actions";
import { OPPORTUNITY_ABANDON_REASON_LABELS } from "@/lib/opportunities/status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  opportunityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const reasonOptions = Object.entries(OPPORTUNITY_ABANDON_REASON_LABELS).map(
  ([value, label]) => ({
    value: value as OpportunityAbandonReason,
    label,
  })
);

export function OpportunityAbandonDialog({ opportunityId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState<OpportunityAbandonReason>("PRICE");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("opportunityId", opportunityId);
    formData.set("reason", reason);
    formData.set("note", note);

    startTransition(async () => {
      setError(null);
      const result = await abandonOpportunity(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      setNote("");
      setReason("PRICE");
      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>放弃商机</DialogTitle>
          <DialogDescription>
            请说明放弃原因，确认后商机状态将变更为「已放弃」。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="abandon-reason">放弃原因 *</Label>
            <select
              id="abandon-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as OpportunityAbandonReason)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {reasonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="abandon-note">
              文字说明{reason === "OTHER" ? " *" : ""}
            </Label>
            <Textarea
              id="abandon-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={reason === "OTHER"}
              placeholder="请补充说明放弃该商机的具体情况"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "提交中…" : "确认放弃"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
