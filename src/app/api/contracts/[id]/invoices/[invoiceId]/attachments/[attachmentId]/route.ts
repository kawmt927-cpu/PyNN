import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getContractForUser } from "@/lib/opportunities/access";
import { contractAttachmentAbsolutePath } from "@/lib/contracts/attachments";

type Ctx = {
  params: Promise<{ id: string; invoiceId: string; attachmentId: string }>;
};

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id: contractId, invoiceId, attachmentId } = await ctx.params;
  const accessible = await getContractForUser(contractId, session.user.role, session.user.id);
  if (!accessible) {
    return NextResponse.json({ error: "无权查看" }, { status: 403 });
  }

  const row = await prisma.contractInvoiceAttachment.findFirst({
    where: {
      id: attachmentId,
      invoiceRecordId: invoiceId,
      invoiceRecord: { contractId },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  }

  const abs = contractAttachmentAbsolutePath(row.storageKey);
  try {
    await stat(abs);
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const stream = createReadStream(abs);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": row.mimeType || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
