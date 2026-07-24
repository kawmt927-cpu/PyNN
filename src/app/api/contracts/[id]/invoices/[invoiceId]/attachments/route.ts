import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getContractForUser } from "@/lib/opportunities/access";
import { canRecordContractPayment } from "@/lib/contracts/access";
import {
  deleteContractAttachmentFile,
  saveContractInvoiceAttachmentFile,
} from "@/lib/contracts/attachments";
import type { UserRole } from "@prisma/client";

const MAX_BYTES = 20 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string; invoiceId: string }> };

async function loadInvoice(contractId: string, invoiceId: string, userId: string, role: UserRole) {
  const accessible = await getContractForUser(contractId, role, userId);
  if (!accessible) return { error: NextResponse.json({ error: "无权操作" }, { status: 403 }) };
  const invoice = await prisma.contractInvoiceRecord.findFirst({
    where: { id: invoiceId, contractId },
  });
  if (!invoice) return { error: NextResponse.json({ error: "开票记录不存在" }, { status: 404 }) };
  return { invoice };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id: contractId, invoiceId } = await ctx.params;
  const loaded = await loadInvoice(contractId, invoiceId, session.user.id, session.user.role);
  if ("error" in loaded && loaded.error) return loaded.error;

  const attachments = await prisma.contractInvoiceAttachment.findMany({
    where: { invoiceRecordId: invoiceId },
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
  if (!canRecordContractPayment(session.user.role)) {
    return NextResponse.json({ error: "无权上传" }, { status: 403 });
  }

  const { id: contractId, invoiceId } = await ctx.params;
  const loaded = await loadInvoice(contractId, invoiceId, session.user.id, session.user.role);
  if ("error" in loaded && loaded.error) return loaded.error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择文件" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "文件大小需在 1B–20MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { storageKey, sizeBytes } = await saveContractInvoiceAttachmentFile({
    contractId,
    invoiceRecordId: invoiceId,
    fileName: file.name,
    bytes,
  });

  const row = await prisma.contractInvoiceAttachment.create({
    data: {
      invoiceRecordId: invoiceId,
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
  if (!canRecordContractPayment(session.user.role)) {
    return NextResponse.json({ error: "无权删除" }, { status: 403 });
  }

  const { id: contractId, invoiceId } = await ctx.params;
  const loaded = await loadInvoice(contractId, invoiceId, session.user.id, session.user.role);
  if ("error" in loaded && loaded.error) return loaded.error;

  const attachmentId = req.nextUrl.searchParams.get("attachmentId")?.trim();
  if (!attachmentId) {
    return NextResponse.json({ error: "缺少 attachmentId" }, { status: 400 });
  }

  const row = await prisma.contractInvoiceAttachment.findFirst({
    where: { id: attachmentId, invoiceRecordId: invoiceId },
  });
  if (!row) {
    return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  }

  await prisma.contractInvoiceAttachment.delete({ where: { id: row.id } });
  await deleteContractAttachmentFile(row.storageKey);
  return NextResponse.json({ ok: true });
}
