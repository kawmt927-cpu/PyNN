import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { ALL_AUTHED_ROLES } from "@/lib/expenses/labels";
import {
  assertInvoiceOcrSupported,
  extractInvoiceFieldsFromFile,
} from "@/lib/contracts/invoice-ocr";

export async function POST(req: NextRequest) {
  try {
    await requireRole([...ALL_AUTHED_ROLES]);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传发票文件" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json({ error: "文件为空" }, { status: 400 });
    }
    if (bytes.length > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "文件过大（上限 12MB）" }, { status: 400 });
    }
    assertInvoiceOcrSupported(file.type || "application/octet-stream", file.name);
    const result = await extractInvoiceFieldsFromFile({
      bytes,
      mimeType: file.type || "application/octet-stream",
      fileName: file.name,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "识别失败" },
      { status: 400 }
    );
  }
}
