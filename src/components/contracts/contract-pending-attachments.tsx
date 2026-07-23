"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ContractAttachmentPreviewButton } from "@/components/contracts/contract-attachment-preview";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = "application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.gif";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 新建合同时先选本地文件，提交成功后再上传到服务器 */
export function ContractPendingAttachments({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (file.size <= 0 || file.size > MAX_BYTES) continue;
      if (next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
        continue;
      }
      next.push(file);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {files.length === 0
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
            disabled={disabled}
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {files.length === 0 ? "选择文件上传" : "继续上传"}
          </Button>
          <span className="text-xs text-muted-foreground">
            支持 PDF / 照片，可多选；单文件不超过 20MB；保存合同后写入服务器
          </span>
        </div>
      </div>
      {files.length === 0 ? null : (
        <ul className="divide-y rounded-md border">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ContractAttachmentPreviewButton
                  fileName={file.name}
                  mimeType={file.type || "application/octet-stream"}
                  source={{ kind: "file", file }}
                  disabled={disabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                >
                  移除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function uploadContractAttachmentFiles(contractId: string, files: File[]) {
  const errors: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/contracts/${contractId}/attachments`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      errors.push(`${file.name}: ${data?.error ?? "上传失败"}`);
    }
  }
  return errors;
}
