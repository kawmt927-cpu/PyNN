import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ALL_AUTHED_ROLES } from "@/lib/expenses/labels";
import { canViewClaim } from "@/lib/expenses/service";
import { expenseAttachmentAbsolutePath } from "@/lib/expenses/attachments";

type Ctx = { params: Promise<{ claimId: string; invoiceId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireRole([...ALL_AUTHED_ROLES]);
    const { claimId, invoiceId } = await ctx.params;
    const claim = await prisma.expenseClaim.findUnique({
      where: { id: claimId },
      select: { applicantId: true, managerId: true, status: true },
    });
    if (!claim || !canViewClaim(claim, session.user)) {
      return NextResponse.json({ error: "无权查看" }, { status: 403 });
    }

    const invoice = await prisma.expenseInvoice.findFirst({
      where: { id: invoiceId, claimId },
    });
    if (!invoice) {
      return NextResponse.json({ error: "附件不存在" }, { status: 404 });
    }

    const abs = expenseAttachmentAbsolutePath(invoice.storageKey);
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
        "Content-Type": invoice.mimeType || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(invoice.fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "下载失败" },
      { status: 400 }
    );
  }
}
