"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PersonnelHrDocumentKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContractAttachmentPreviewButton } from "@/components/contracts/contract-attachment-preview";
import {
  createHrDocument,
  deleteHrDocument,
  updateHrDocument,
} from "@/app/(dashboard)/hr/employees/actions";
import {
  defaultHrDocumentTitle,
  formatDateInput,
  HR_DOCUMENT_KIND_LABELS,
  isOcrDocumentKind,
} from "@/lib/personnel/hr-documents";

export type HrDocumentFileView = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByName: string;
};

export type HrDocumentView = {
  id: string;
  kind: PersonnelHrDocumentKind;
  title: string;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  files: HrDocumentFileView[];
};

type Props = {
  userId: string;
  documents: HrDocumentView[];
};

const ACCEPT = "application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.gif";
const KINDS: PersonnelHrDocumentKind[] = [
  "ID_CARD",
  "CERTIFICATE",
  "EMPLOYMENT_CONTRACT",
  "NDA",
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileUrl(userId: string, fileId: string, inline?: boolean) {
  const base = `/api/hr/employees/${userId}/files/${fileId}`;
  return inline ? `${base}?inline=1` : base;
}

function kindHint(kind: PersonnelHrDocumentKind) {
  if (kind === "ID_CARD" || kind === "CERTIFICATE") {
    return "上传图片或 PDF 后会尝试用 AI 识别到期日，可再手工修改。";
  }
  return "上传后请手工填写起止/到期日，不自动识别。";
}

export function HrDocumentsPanel({ userId, documents }: Props) {
  return (
    <div className="space-y-8">
      {KINDS.map((kind) => (
        <KindSection
          key={kind}
          userId={userId}
          kind={kind}
          documents={documents.filter((d) => d.kind === kind)}
        />
      ))}
    </div>
  );
}

function KindSection({
  userId,
  kind,
  documents,
}: {
  userId: string;
  kind: PersonnelHrDocumentKind;
  documents: HrDocumentView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createHrDocument({
        userId,
        kind,
        title: title.trim() || defaultHrDocumentTitle(kind),
        issuedAt: "",
        expiresAt: "",
        notes: "",
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle("");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-medium">{HR_DOCUMENT_KIND_LABELS[kind]}</h3>
        <p className="text-sm text-muted-foreground">{kindHint(kind)}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">名称</Label>
          <Input
            className="w-52"
            placeholder={defaultHrDocumentTitle(kind)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" onClick={handleAdd} disabled={pending}>
          {pending ? "添加中…" : "新增"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无记录，可先新增再上传附件。</p>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => (
            <DocumentCard
              key={`${doc.id}-${doc.expiresAt ?? ""}-${doc.issuedAt ?? ""}-${doc.files.length}`}
              userId={userId}
              document={doc}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DocumentCard({ userId, document }: { userId: string; document: HrDocumentView }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [ocrPending, startOcr] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(document.title);
  const [issuedAt, setIssuedAt] = useState(formatDateInput(document.issuedAt));
  const [expiresAt, setExpiresAt] = useState(formatDateInput(document.expiresAt));
  const [notes, setNotes] = useState(document.notes ?? "");
  const canOcr = isOcrDocumentKind(document.kind);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateHrDocument({
        userId,
        documentId: document.id,
        title,
        issuedAt,
        expiresAt,
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("确定删除该证件及其附件？")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteHrDocument({ userId, documentId: document.id });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    const tooLarge = files.find((file) => file.size > 20 * 1024 * 1024);
    if (tooLarge) {
      setError(`「${tooLarge.name}」超过 20MB`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const failures: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("documentId", document.id);
        form.set("kind", document.kind);
        const res = await fetch(`/api/hr/employees/${userId}/files`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          ocrError?: string | null;
        } | null;
        if (!res.ok) {
          failures.push(`${file.name}：${data?.error ?? "上传失败"}`);
        } else if (data?.ocrError) {
          failures.push(`${file.name} 已上传，识别未成功：${data.ocrError}`);
        }
      }
      router.refresh();
      if (failures.length > 0) setError(failures.join("；"));
    });
  }

  function onDeleteFile(fileId: string) {
    if (!confirm("确定删除该附件？")) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/hr/employees/${userId}/files?fileId=${encodeURIComponent(fileId)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "删除失败");
        return;
      }
      router.refresh();
    });
  }

  function onOcr(fileId: string) {
    setError(null);
    startOcr(async () => {
      const res = await fetch(`/api/hr/employees/${userId}/files/${fileId}/ocr`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "识别失败");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">名称</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">起始/发证日</Label>
          <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">到期日</Label>
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label className="text-xs text-muted-foreground">备注</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          {pending ? "保存中…" : "保存日期"}
        </Button>
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
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "上传中…" : document.files.length === 0 ? "选择文件上传" : "继续上传"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={handleDelete}
        >
          删除证件
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {document.files.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无附件</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {document.files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.sizeBytes)} · {file.uploadedByName} · {file.createdAt.slice(0, 10)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ContractAttachmentPreviewButton
                  fileName={file.fileName}
                  mimeType={file.mimeType}
                  source={{ kind: "url", url: fileUrl(userId, file.id, true) }}
                  disabled={pending}
                />
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={fileUrl(userId, file.id)} download={file.fileName}>
                    下载
                  </a>
                </Button>
                {canOcr ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={ocrPending || pending}
                    onClick={() => onOcr(file.id)}
                  >
                    {ocrPending ? "识别中…" : "识别到期日"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => onDeleteFile(file.id)}
                >
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
