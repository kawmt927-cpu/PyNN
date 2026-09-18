import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpportunityForUser } from "@/lib/opportunities/access";
import { opportunityQuoteAttachmentAbsolutePath } from "@/lib/opportunities/quote-attachments";

type Ctx = {
  params: Promise<{ id: string; quoteId: string; attachmentId: string }>;
};

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id: opportunityId, quoteId, attachmentId } = await ctx.params;
  const accessible = await getOpportunityForUser(
    opportunityId,
    session.user.role,
    session.user.id
  );
  if (!accessible) {
    return NextResponse.json({ error: "无权查看" }, { status: 403 });
  }

  const row = await prisma.opportunityQuoteAttachment.findFirst({
    where: {
      id: attachmentId,
      quoteId,
      quote: { opportunityId },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  }

  const abs = opportunityQuoteAttachmentAbsolutePath(row.storageKey);
  try {
    await stat(abs);
  } catch {
    return NextResponse.json({ error: "文件已丢失" }, { status: 404 });
  }

  const nodeStream = createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  const encodedName = encodeURIComponent(row.fileName);
  const inline = req.nextUrl.searchParams.get("inline") === "1";

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": row.mimeType || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
