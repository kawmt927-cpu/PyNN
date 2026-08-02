import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "expenses");

export function expenseAttachmentAbsolutePath(storageKey: string): string {
  const normalized = storageKey.replace(/^\/+/, "").replace(/\.\./g, "");
  if (!normalized.startsWith("expenses/")) {
    throw new Error("非法附件路径");
  }
  return path.join(process.cwd(), "uploads", normalized);
}

export function sanitizeExpenseFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\u4e00-\u9fff\-()（）\s]/g, "_");
  return base.slice(0, 180) || "file";
}

export async function saveExpenseInvoiceFile(params: {
  claimId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const safeName = sanitizeExpenseFileName(params.fileName);
  const dir = path.join(UPLOAD_ROOT, params.claimId);
  await mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const storedName = `${id}-${safeName}`;
  const abs = path.join(dir, storedName);
  await writeFile(abs, params.bytes);
  return {
    storageKey: `expenses/${params.claimId}/${storedName}`,
    sizeBytes: params.bytes.length,
  };
}

export async function deleteExpenseInvoiceFile(storageKey: string): Promise<void> {
  try {
    await unlink(expenseAttachmentAbsolutePath(storageKey));
  } catch {
    // ignore
  }
}
