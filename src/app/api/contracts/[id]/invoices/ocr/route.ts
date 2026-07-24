import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getContractForUser } from "@/lib/opportunities/access";
import { canRecordContractPayment, isSignedContractStatus } from "@/lib/contracts/access";
import { extractInvoiceFieldsFromFile } from "@/lib/contracts/invoice-ocr";

const MAX_BYTES = 12 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string }> };

/** POST multipart file → AI 识别开票字段（不落库，供表单回填） */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canRecordContractPayment(session.user.role)) {
    return NextResponse.json({ error: "无权识别开票" }, { status: 403 });
  }

  const { id: contractId } = await ctx.params;
  const accessible = await getContractForUser(contractId, session.user.role, session.user.id);
  if (!accessible) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }
  if (!isSignedContractStatus(accessible.status)) {
    return NextResponse.json({ error: "仅已签署合同可识别开票" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择发票文件（图片或 PDF）" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "文件大小需在 1B–12MB" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await extractInvoiceFieldsFromFile({
      bytes,
      mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      fileName: file.name,
    });
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "识别失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
