"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function isImageAttachment(mimeType: string, fileName: string) {
  if (mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(fileName);
}

export function isPdfAttachment(mimeType: string, fileName: string) {
  if (mimeType === "application/pdf") return true;
  return /\.pdf$/i.test(fileName);
}

export function canPreviewAttachment(mimeType: string, fileName: string) {
  return isImageAttachment(mimeType, fileName) || isPdfAttachment(mimeType, fileName);
}

type PreviewSource =
  | { kind: "url"; url: string }
  | { kind: "file"; file: File };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  mimeType: string;
  source: PreviewSource | null;
};

export function ContractAttachmentPreviewDialog({
  open,
  onOpenChange,
  fileName,
  mimeType,
  source,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !source || source.kind !== "file") {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(source.file);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [open, source]);

  const previewUrl = useMemo(() => {
    if (!source) return null;
    if (source.kind === "url") return source.url;
    return blobUrl;
  }, [source, blobUrl]);

  const image = isImageAttachment(mimeType, fileName);
  const pdf = isPdfAttachment(mimeType, fileName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[92vh] w-[min(96vw,56rem)] max-w-none flex-col gap-3 p-4"
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate text-base">{fileName}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30">
          {!previewUrl ? (
            <p className="p-6 text-sm text-muted-foreground">无法预览该附件</p>
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob / authenticated session URL
            <img src={previewUrl} alt={fileName} className="mx-auto max-h-[75vh] w-auto object-contain" />
          ) : pdf ? (
            <iframe title={fileName} src={previewUrl} className="h-[75vh] w-full border-0 bg-white" />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">该文件类型不支持内嵌预览，请下载后查看。</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PreviewButtonProps = {
  fileName: string;
  mimeType: string;
  source: PreviewSource;
  disabled?: boolean;
};

/** 预览按钮：图片/PDF 弹窗预览 */
export function ContractAttachmentPreviewButton({
  fileName,
  mimeType,
  source,
  disabled,
}: PreviewButtonProps) {
  const [open, setOpen] = useState(false);
  if (!canPreviewAttachment(mimeType, fileName)) return null;

  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        预览
      </Button>
      <ContractAttachmentPreviewDialog
        open={open}
        onOpenChange={setOpen}
        fileName={fileName}
        mimeType={mimeType}
        source={open ? source : null}
      />
    </>
  );
}
