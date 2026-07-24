import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "contracts");

/** 相对项目根的存储键，如 contracts/<contractId>/<uuid>-name.pdf */
export function contractAttachmentAbsolutePath(storageKey: string): string {
  const normalized = storageKey.replace(/^\/+/, "").replace(/\.\./g, "");
  if (!normalized.startsWith("contracts/")) {
    throw new Error("非法附件路径");
  }
  return path.join(process.cwd(), "uploads", normalized);
}

export function sanitizeAttachmentFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\u4e00-\u9fff\-()（）\s]/g, "_");
  return base.slice(0, 180) || "file";
}

export async function saveContractAttachmentFile(params: {
  contractId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const safeName = sanitizeAttachmentFileName(params.fileName);
  const dir = path.join(UPLOAD_ROOT, params.contractId);
  await mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const storedName = `${id}-${safeName}`;
  const abs = path.join(dir, storedName);
  await writeFile(abs, params.bytes);
  return {
    storageKey: `contracts/${params.contractId}/${storedName}`,
    sizeBytes: params.bytes.length,
  };
}

/** 开票附件：contracts/<contractId>/invoices/<invoiceRecordId>/<uuid>-name */
export async function saveContractInvoiceAttachmentFile(params: {
  contractId: string;
  invoiceRecordId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const safeName = sanitizeAttachmentFileName(params.fileName);
  const dir = path.join(UPLOAD_ROOT, params.contractId, "invoices", params.invoiceRecordId);
  await mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const storedName = `${id}-${safeName}`;
  const abs = path.join(dir, storedName);
  await writeFile(abs, params.bytes);
  return {
    storageKey: `contracts/${params.contractId}/invoices/${params.invoiceRecordId}/${storedName}`,
    sizeBytes: params.bytes.length,
  };
}

export async function deleteContractAttachmentFile(storageKey: string): Promise<void> {
  try {
    await unlink(contractAttachmentAbsolutePath(storageKey));
  } catch {
    // 文件可能已不存在
  }
}
