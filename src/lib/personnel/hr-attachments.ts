import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { sanitizeAttachmentFileName } from "@/lib/contracts/attachments";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "personnel");

/** 相对项目根的存储键，如 personnel/<userId>/<documentId>/<uuid>-name.pdf */
export function personnelHrFileAbsolutePath(storageKey: string): string {
  const normalized = storageKey.replace(/^\/+/, "").replace(/\.\./g, "");
  if (!normalized.startsWith("personnel/")) {
    throw new Error("非法附件路径");
  }
  return path.join(process.cwd(), "uploads", normalized);
}

export async function savePersonnelHrDocumentFile(params: {
  userId: string;
  documentId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const safeName = sanitizeAttachmentFileName(params.fileName);
  const dir = path.join(UPLOAD_ROOT, params.userId, params.documentId);
  await mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const storedName = `${id}-${safeName}`;
  const abs = path.join(dir, storedName);
  await writeFile(abs, params.bytes);
  return {
    storageKey: `personnel/${params.userId}/${params.documentId}/${storedName}`,
    sizeBytes: params.bytes.length,
  };
}

export async function deletePersonnelHrDocumentFile(storageKey: string): Promise<void> {
  try {
    await unlink(personnelHrFileAbsolutePath(storageKey));
  } catch {
    // 文件可能已不存在
  }
}
