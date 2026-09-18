import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import type { PersonnelHrDocumentKind } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageHrEmployees } from "@/lib/personnel/access";
import {
  defaultHrDocumentTitle,
  isOcrDocumentKind,
} from "@/lib/personnel/hr-documents";
import {
  savePersonnelHrDocumentFile,
  deletePersonnelHrDocumentFile,
} from "@/lib/personnel/hr-attachments";
import { applyHrDocumentOcr } from "@/lib/personnel/hr-ocr-apply";

const MAX_BYTES = 20 * 1024 * 1024;

type Ctx = { params: Promise<{ userId: string }> };

function parseKind(raw: unknown): PersonnelHrDocumentKind | null {
  if (
    raw === "ID_CARD" ||
    raw === "CERTIFICATE" ||
    raw === "EMPLOYMENT_CONTRACT" ||
    raw === "NDA"
  ) {
    return raw;
  }
  return null;
}

async function requireHrSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  }
  if (!canManageHrEmployees(session.user.role)) {
    return { error: NextResponse.json({ error: "无权操作" }, { status: 403 }) };
  }
  return { session };
}

function revalidateEmployee(userId: string) {
  revalidatePath("/hr");
  revalidatePath("/hr/employees");
  revalidatePath(`/hr/employees/${userId}`);
}

/** POST multipart：上传附件；身份证/证书会尝试识别到期日 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireHrSession();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "员工不存在" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择文件" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "文件大小需在 1B–20MB" }, { status: 400 });
  }

  let documentId = String(form.get("documentId") ?? "").trim();
  const kind = parseKind(form.get("kind"));
  const titleRaw = String(form.get("title") ?? "").trim();

  if (!documentId) {
    if (!kind) return NextResponse.json({ error: "缺少证件类型" }, { status: 400 });
    const created = await prisma.personnelHrDocument.create({
      data: {
        userId,
        kind,
        title: titleRaw || defaultHrDocumentTitle(kind),
      },
    });
    documentId = created.id;
  }

  const document = await prisma.personnelHrDocument.findFirst({
    where: { id: documentId, userId },
  });
  if (!document) {
    return NextResponse.json({ error: "证件不存在" }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { storageKey, sizeBytes } = await savePersonnelHrDocumentFile({
    userId,
    documentId,
    fileName: file.name,
    bytes,
  });

  const row = await prisma.personnelHrDocumentFile.create({
    data: {
      documentId,
      fileName: file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes,
      storageKey,
      uploadedById: auth.session.user.id,
    },
    include: { uploadedBy: { select: { name: true } } },
  });

  let ocr = null as Awaited<ReturnType<typeof applyHrDocumentOcr>> | null;
  let ocrError: string | null = null;
  if (isOcrDocumentKind(document.kind)) {
    try {
      ocr = await applyHrDocumentOcr({
        userId,
        documentId,
        kind: document.kind,
        overwrite: false,
        bytes,
        mimeType: row.mimeType,
        fileName: row.fileName,
      });
    } catch (error) {
      ocrError = error instanceof Error ? error.message : "识别失败";
    }
  }

  revalidateEmployee(userId);
  return NextResponse.json({
    documentId,
    file: {
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      uploadedByName: row.uploadedBy.name,
    },
    ocr,
    ocrError,
  });
}

/** DELETE ?fileId= */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireHrSession();
  if ("error" in auth) return auth.error;
  const { userId } = await ctx.params;
  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "缺少 fileId" }, { status: 400 });

  const row = await prisma.personnelHrDocumentFile.findFirst({
    where: { id: fileId, document: { userId } },
  });
  if (!row) return NextResponse.json({ error: "附件不存在" }, { status: 404 });

  await prisma.personnelHrDocumentFile.delete({ where: { id: row.id } });
  await deletePersonnelHrDocumentFile(row.storageKey);
  revalidateEmployee(userId);
  return NextResponse.json({ ok: true });
}
