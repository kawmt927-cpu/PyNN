"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ContractAttachmentPreviewButton } from "@/components/contracts/contract-attachment-preview";

type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByName: string;
};

type Props = {
  contractId: string;
  /** 同时允许上传与删除；可被 canUpload / canDelete 覆盖 */
  canManage?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentUrl(contractId: string, attachmentId: string, inline?: boolean) {
  const base = `/api/contracts/${contractId}/attachments/${attachmentId}`;
  return inline ? `${base}?inline=1` : base;
}

const ACCEPT = "application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.gif";

export function ContractAttachmentsPanel({
  contractId,
  canManage = false,
  canUpload,
  canDelete,
}: Props) {
  const allowUpload = canUpload ?? canManage;
  const allowDelete = canDelete ?? canManage;
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"upload" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/contracts/${contractId}/attachments`, {
      credentials: "include",
    });
    if (!res.ok) {
      setError("加载附件失败");
      return;
    }
    const data = (await res.json()) as { attachments: AttachmentRow[] };
    setRows(data.attachments);
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    const tooLarge = files.find((file) => file.size > 20 * 1024 * 1024);
    if (tooLarge) {
      setError(`「${tooLarge.name}」超过 20MB，请压缩后重试`);
      return;
    }
    setError(null);
    setBusyAction("upload");
    startTransition(async () => {
      const failures: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch(`/api/contracts/${contractId}/attachments`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 413) {
            failures.push(`${file.name}：上传被网关拒绝（体积过大），请确认单文件 ≤20MB 后重试`);
            continue;
          }
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          failures.push(`${file.name}：${data?.error ?? "上传失败"}`);
        }
      }
      await load();
      if (failures.length > 0) {
        setError(failures.join("；"));
      }
      setBusyAction(null);
    });
  }

  function onDelete(attachmentId: string) {
    if (!confirm("确定删除该附件？")) return;
    setError(null);
    setBusyAction("delete");
    startTransition(async () => {
      const res = await fetch(
        `/api/contracts/${contractId}/attachments?attachmentId=${encodeURIComponent(attachmentId)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "删除失败");
        setBusyAction(null);
        return;
      }
      await load();
      setBusyAction(null);
    });
  }

  const uploadLabel =
    busyAction === "upload" && pending
      ? "上传中…"
      : busyAction === "delete" && pending
        ? "删除中…"
        : rows.length === 0
          ? "选择文件上传"
          : "继续上传";

  return (
    <div className="space-y-3 text-sm">
      {allowUpload ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "请上传合同 PDF、扫描件或现场照片。"
              : "已有附件，可继续上传更多文件。"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              tabIndex={-1}
              disabled={pending}
              onChange={(e) => {
                onUpload(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadLabel}
            </Button>
            <span className="text-xs text-muted-foreground">
              支持 PDF / 照片，可多选；单文件不超过 20MB
            </span>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
      {rows.length === 0 ? (
        allowUpload ? null : <p className="text-muted-foreground">暂无附件</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(row.sizeBytes)} · {row.uploadedByName} · {row.createdAt.slice(0, 10)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ContractAttachmentPreviewButton
                  fileName={row.fileName}
                  mimeType={row.mimeType}
                  source={{ kind: "url", url: attachmentUrl(contractId, row.id, true) }}
                  disabled={pending}
                />
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={attachmentUrl(contractId, row.id)} download={row.fileName}>
                    下载
                  </a>
                </Button>
                {allowDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => onDelete(row.id)}
                  >
                    {busyAction === "delete" && pending ? "删除中…" : "删除"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
