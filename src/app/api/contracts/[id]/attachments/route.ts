import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getContractForUser } from "@/lib/opportunities/access";
import { canManageContractAttachments } from "@/lib/contracts/access";
import {
  deleteContractAttachmentFile,
  saveContractAttachmentFile,
} from "@/lib/contracts/attachments";

const MAX_BYTES = 20 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id: contractId } = await ctx.params;
  const accessible = await getContractForUser(contractId, session.user.role, session.user.id);
  if (!accessible) {
    return NextResponse.json({ error: "无权查看" }, { status: 403 });
  }

  const attachments = await prisma.contractAttachment.findMany({
    where: { contractId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  return NextResponse.json({
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt.toISOString(),
      uploadedByName: a.uploadedBy.name,
    })),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canManageContractAttachments(session.user.role)) {
    return NextResponse.json({ error: "无权上传" }, { status: 403 });
  }

  const { id: contractId } = await ctx.params;
  const accessible = await getContractForUser(contractId, session.user.role, session.user.id);
  if (!accessible) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择文件" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "文件大小需在 1B–20MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { storageKey, sizeBytes } = await saveContractAttachmentFile({
    contractId,
    fileName: file.name,
    bytes,
  });

  const row = await prisma.contractAttachment.create({
    data: {
      contractId,
      fileName: file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes,
      storageKey,
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { name: true } } },
  });

  return NextResponse.json({
    attachment: {
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      uploadedByName: row.uploadedBy.name,
    },
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canManageContractAttachments(session.user.role)) {
    return NextResponse.json({ error: "无权删除" }, { status: 403 });
  }

  const { id: contractId } = await ctx.params;
  const accessible = await getContractForUser(contractId, session.user.role, session.user.id);
  if (!accessible) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const attachmentId = req.nextUrl.searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json({ error: "缺少 attachmentId" }, { status: 400 });
  }

  const row = await prisma.contractAttachment.findFirst({
    where: { id: attachmentId, contractId },
  });
  if (!row) {
    return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  }

  await prisma.contractAttachment.delete({ where: { id: row.id } });
  await deleteContractAttachmentFile(row.storageKey);

  return NextResponse.json({ ok: true });
}
