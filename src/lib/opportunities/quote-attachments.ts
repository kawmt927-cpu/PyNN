import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { sanitizeAttachmentFileName } from "@/lib/contracts/attachments";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "opportunities");

/** 相对项目根：opportunities/<opportunityId>/quotes/<quoteId>/<uuid>-name */
export function opportunityQuoteAttachmentAbsolutePath(storageKey: string): string {
  const normalized = storageKey.replace(/^\/+/, "").replace(/\.\./g, "");
  if (!normalized.startsWith("opportunities/")) {
    throw new Error("非法附件路径");
  }
  return path.join(process.cwd(), "uploads", normalized);
}

export async function saveOpportunityQuoteAttachmentFile(params: {
  opportunityId: string;
  quoteId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; sizeBytes: number }> {
  const safeName = sanitizeAttachmentFileName(params.fileName);
  const dir = path.join(UPLOAD_ROOT, params.opportunityId, "quotes", params.quoteId);
  await mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const storedName = `${id}-${safeName}`;
  const abs = path.join(dir, storedName);
  await writeFile(abs, params.bytes);
  return {
    storageKey: `opportunities/${params.opportunityId}/quotes/${params.quoteId}/${storedName}`,
    sizeBytes: params.bytes.length,
  };
}

export async function deleteOpportunityQuoteAttachmentFile(storageKey: string): Promise<void> {
  try {
    await unlink(opportunityQuoteAttachmentAbsolutePath(storageKey));
  } catch {
    // 文件可能已不存在
  }
}
