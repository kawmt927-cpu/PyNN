"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";
import { formatAmount } from "@/lib/opportunities/funnel";
import {
  deleteOpportunityQuote,
} from "@/app/(dashboard)/opportunities/actions";
import { OpportunityQuoteDialog } from "@/components/opportunities/opportunity-quote-dialog";

export type OpportunityQuoteRow = {
  id: string;
  amount: number;
  quotedAt: string;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

type Props = {
  opportunityId: string;
  quotes: OpportunityQuoteRow[];
  canManage: boolean;
  canCreate: boolean;
};

type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
  uploadedByName?: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentHref(
  opportunityId: string,
  quoteId: string,
  attachmentId: string,
  inline?: boolean
) {
  const base = `/api/opportunities/${opportunityId}/quotes/${quoteId}/attachments/${attachmentId}`;
  return inline ? `${base}?inline=1` : base;
}

function QuoteAttachments({
  opportunityId,
  quoteId,
  initial,
  canManage,
}: {
  opportunityId: string;
  quoteId: string;
  initial: AttachmentRow[];
  canManage: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const reload = useCallback(async () => {
    const res = await fetch(
      `/api/opportunities/${opportunityId}/quotes/${quoteId}/attachments`,
      { credentials: "include" }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { attachments: AttachmentRow[] };
    setRows(data.attachments);
  }, [opportunityId, quoteId]);

  function onUpload(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    const tooLarge = files.find((f) => f.size > 20 * 1024 * 1024);
    if (tooLarge) {
      setError(`「${tooLarge.name}」超过 20MB`);
      return;
    }
    setError(null);
    startTransition(async () => {
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch(
          `/api/opportunities/${opportunityId}/quotes/${quoteId}/attachments`,
          { method: "POST", body, credentials: "include" }
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error || `上传「${file.name}」失败`);
          return;
        }
      }
      await reload();
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function onDelete(attachmentId: string, fileName: string) {
    if (!confirmDestructiveAction(`确定删除附件「${fileName}」？`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/quotes/${quoteId}/attachments?attachmentId=${encodeURIComponent(attachmentId)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || "删除失败");
        return;
      }
      await reload();
    });
  }

  return (
    <div className="mt-2 space-y-1.5">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无附件</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2">
              <a
                href={attachmentHref(opportunityId, quoteId, row.id, true)}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {row.fileName}
              </a>
              <span className="text-xs text-muted-foreground">{formatSize(row.sizeBytes)}</span>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={pending}
                  onClick={() => onDelete(row.id, row.fileName)}
                >
                  删除
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? "处理中…" : "上传附件"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function OpportunityQuotesPanel({
  opportunityId,
  quotes,
  canManage,
  canCreate,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<OpportunityQuoteRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete(quote: OpportunityQuoteRow) {
    if (
      !confirmDestructiveAction(
        `确定删除 ${formatAmount(quote.amount)} 的报价单？附件将一并删除。`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteOpportunityQuote(quote.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {quotes.length > 0 ? `共 ${quotes.length} 份` : "尚未录入报价单"}
        </p>
        {canCreate ? (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            新增报价单
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {quotes.length === 0 ? null : (
        <ul className="divide-y rounded-md border">
          {quotes.map((quote) => (
            <li key={quote.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium tabular-nums">
                    {formatAmount(quote.amount)}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {quote.quotedAt.slice(0, 10)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {quote.createdByName} · 录入 {quote.createdAt.slice(0, 10)}
                  </p>
                  {quote.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {quote.notes}
                    </p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditing(quote)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => onDelete(quote)}
                    >
                      删除
                    </Button>
                  </div>
                ) : null}
              </div>
              <QuoteAttachments
                opportunityId={opportunityId}
                quoteId={quote.id}
                canManage={canManage}
                initial={quote.attachments}
              />
            </li>
          ))}
        </ul>
      )}

      <OpportunityQuoteDialog
        opportunityId={opportunityId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <OpportunityQuoteDialog
        opportunityId={opportunityId}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initial={
          editing
            ? {
                id: editing.id,
                amount: String(editing.amount),
                quotedAt: editing.quotedAt.slice(0, 10),
                notes: editing.notes ?? "",
              }
            : null
        }
      />
    </div>
  );
}
