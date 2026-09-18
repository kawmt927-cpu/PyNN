"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createOpportunityQuote,
  updateOpportunityQuote,
} from "@/app/(dashboard)/opportunities/actions";
import { toUserFacingActionErrorMessage } from "@/lib/action-result";

type QuoteDraft = {
  id?: string;
  amount: string;
  quotedAt: string;
  notes: string;
};

type Props = {
  opportunityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: QuoteDraft | null;
  /** 创建成功后可选跳转到详情 */
  detailHref?: string;
};

function todayDateInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const ACCEPT = "application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx";

export function OpportunityQuoteDialog({
  opportunityId,
  open,
  onOpenChange,
  initial = null,
  detailHref,
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [quotedAt, setQuotedAt] = useState(initial?.quotedAt ?? todayDateInput());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAmount(initial?.amount ?? "");
    setQuotedAt(initial?.quotedAt ?? todayDateInput());
    setNotes(initial?.notes ?? "");
    setPendingFiles([]);
    if (fileRef.current) fileRef.current.value = "";
  }, [open, initial]);

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = Array.from(list);
    const tooLarge = next.find((f) => f.size > 20 * 1024 * 1024);
    if (tooLarge) {
      setError(`「${tooLarge.name}」超过 20MB`);
      return;
    }
    setError(null);
    setPendingFiles((prev) => [...prev, ...next]);
  }

  async function uploadFiles(quoteId: string) {
    for (const file of pendingFiles) {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(
        `/api/opportunities/${opportunityId}/quotes/${quoteId}/attachments`,
        { method: "POST", body, credentials: "include" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `上传「${file.name}」失败`);
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("amount", amount);
    formData.set("quotedAt", quotedAt);
    formData.set("notes", notes);

    startTransition(async () => {
      try {
        if (isEdit && initial?.id) {
          formData.set("quoteId", initial.id);
          const result = await updateOpportunityQuote(formData);
          if (result.error) {
            setError(result.error);
            return;
          }
          if (pendingFiles.length > 0) {
            await uploadFiles(initial.id);
          }
        } else {
          formData.set("opportunityId", opportunityId);
          const result = await createOpportunityQuote(formData);
          if (result.error) {
            setError(result.error);
            return;
          }
          if (!result.quoteId) {
            setError("创建成功但未返回报价单编号");
            return;
          }
          if (pendingFiles.length > 0) {
            await uploadFiles(result.quoteId);
          }
        }
        onOpenChange(false);
        router.refresh();
        if (!isEdit && detailHref) {
          router.push(detailHref);
        }
      } catch (err) {
        setError(toUserFacingActionErrorMessage(err));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑报价单" : "新增报价单"}</DialogTitle>
          <DialogDescription>填写报价金额、日期与备注，可附带方案/报价文件。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quote-amount">报价金额 *</Label>
            <Input
              id="quote-amount"
              type="number"
              min={0.01}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-date">报价日期 *</Label>
            <Input
              id="quote-date"
              type="date"
              required
              value={quotedAt}
              onChange={(e) => setQuotedAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-notes">备注</Label>
            <Textarea
              id="quote-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="报价说明、有效期、包含范围等"
            />
          </div>
          <div className="space-y-2">
            <Label>附件</Label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="block w-full text-sm"
              onChange={(e) => onPickFiles(e.target.files)}
            />
            {pendingFiles.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {pendingFiles.map((file) => (
                  <li key={`${file.name}-${file.size}`}>{file.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">可选，单文件不超过 20MB</p>
            )}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
