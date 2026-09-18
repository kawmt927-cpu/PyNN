import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { readFile } from "fs/promises";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageHrEmployees } from "@/lib/personnel/access";
import { isOcrDocumentKind } from "@/lib/personnel/hr-documents";
import { personnelHrFileAbsolutePath } from "@/lib/personnel/hr-attachments";
import { applyHrDocumentOcr } from "@/lib/personnel/hr-ocr-apply";

type Ctx = { params: Promise<{ userId: string; fileId: string }> };

/** POST：对已上传附件重新识别到期日（覆盖已填日期） */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canManageHrEmployees(session.user.role)) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { userId, fileId } = await ctx.params;
  const row = await prisma.personnelHrDocumentFile.findFirst({
    where: { id: fileId, document: { userId } },
    include: { document: { select: { id: true, kind: true } } },
  });
  if (!row) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  if (!isOcrDocumentKind(row.document.kind)) {
    return NextResponse.json({ error: "该类型不支持自动识别" }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(personnelHrFileAbsolutePath(row.storageKey));
  } catch {
    return NextResponse.json({ error: "文件已丢失" }, { status: 404 });
  }

  try {
    const ocr = await applyHrDocumentOcr({
      userId,
      documentId: row.document.id,
      kind: row.document.kind,
      overwrite: true,
      bytes,
      mimeType: row.mimeType,
      fileName: row.fileName,
    });
    revalidatePath("/hr");
    revalidatePath("/hr/employees");
    revalidatePath(`/hr/employees/${userId}`);
    return NextResponse.json({ ocr });
  } catch (error) {
    const message = error instanceof Error ? error.message : "识别失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
