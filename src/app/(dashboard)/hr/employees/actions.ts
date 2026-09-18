"use server";

import { revalidatePath } from "next/cache";
import { PersonnelHrDocumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { parseDateInput } from "@/lib/personnel/hr-documents";
import { deletePersonnelHrDocumentFile } from "@/lib/personnel/hr-attachments";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

function parseKind(raw: string): PersonnelHrDocumentKind {
  if (
    raw === "ID_CARD" ||
    raw === "CERTIFICATE" ||
    raw === "EMPLOYMENT_CONTRACT" ||
    raw === "NDA"
  ) {
    return raw;
  }
  throw new Error("证件类型无效");
}

async function requireEmployee(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new Error("员工不存在");
  return user;
}

function revalidateEmployee(userId: string) {
  revalidatePath("/hr");
  revalidatePath("/hr/employees");
  revalidatePath(`/hr/employees/${userId}`);
}

export async function updateHrEmployeeProfile(input: {
  userId: string;
  hiredAt: string;
  idNumber: string;
  idExpiresAt: string;
  emergencyName: string;
  emergencyPhone: string;
  address: string;
  notes: string;
}): Promise<ActionResult> {
  try {
    await requireRole(["HR", "ADMIN"]);
    await requireEmployee(input.userId);
    const hiredAt = parseDateInput(input.hiredAt);
    const idExpiresAt = parseDateInput(input.idExpiresAt);
    await prisma.personnelHrProfile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        hiredAt,
        idNumber: input.idNumber.trim() || null,
        idExpiresAt,
        emergencyName: input.emergencyName.trim() || null,
        emergencyPhone: input.emergencyPhone.trim() || null,
        address: input.address.trim() || null,
        notes: input.notes.trim() || null,
      },
      update: {
        hiredAt,
        idNumber: input.idNumber.trim() || null,
        idExpiresAt,
        emergencyName: input.emergencyName.trim() || null,
        emergencyPhone: input.emergencyPhone.trim() || null,
        address: input.address.trim() || null,
        notes: input.notes.trim() || null,
      },
    });
    revalidateEmployee(input.userId);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function createHrDocument(input: {
  userId: string;
  kind: string;
  title: string;
  issuedAt: string;
  expiresAt: string;
  notes: string;
}): Promise<ActionResult & { documentId?: string }> {
  try {
    await requireRole(["HR", "ADMIN"]);
    await requireEmployee(input.userId);
    const kind = parseKind(input.kind);
    const title = input.title.trim();
    if (!title) throw new Error("请填写名称");
    const row = await prisma.personnelHrDocument.create({
      data: {
        userId: input.userId,
        kind,
        title,
        issuedAt: parseDateInput(input.issuedAt),
        expiresAt: parseDateInput(input.expiresAt),
        notes: input.notes.trim() || null,
      },
    });
    revalidateEmployee(input.userId);
    return { documentId: row.id };
  } catch (error) {
    return formatError(error);
  }
}

export async function updateHrDocument(input: {
  userId: string;
  documentId: string;
  title: string;
  issuedAt: string;
  expiresAt: string;
  notes: string;
}): Promise<ActionResult> {
  try {
    await requireRole(["HR", "ADMIN"]);
    const row = await prisma.personnelHrDocument.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: { id: true, kind: true },
    });
    if (!row) throw new Error("证件不存在");
    const title = input.title.trim();
    if (!title) throw new Error("请填写名称");
    const expiresAt = parseDateInput(input.expiresAt);
    await prisma.personnelHrDocument.update({
      where: { id: row.id },
      data: {
        title,
        issuedAt: parseDateInput(input.issuedAt),
        expiresAt,
        notes: input.notes.trim() || null,
      },
    });
    if (row.kind === "ID_CARD" && expiresAt) {
      await prisma.personnelHrProfile.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, idExpiresAt: expiresAt },
        update: { idExpiresAt: expiresAt },
      });
    }
    revalidateEmployee(input.userId);
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteHrDocument(input: {
  userId: string;
  documentId: string;
}): Promise<ActionResult> {
  try {
    await requireRole(["HR", "ADMIN"]);
    const row = await prisma.personnelHrDocument.findFirst({
      where: { id: input.documentId, userId: input.userId },
      include: { files: { select: { storageKey: true } } },
    });
    if (!row) throw new Error("证件不存在");
    await prisma.personnelHrDocument.delete({ where: { id: row.id } });
    await Promise.all(row.files.map((f) => deletePersonnelHrDocumentFile(f.storageKey)));
    revalidateEmployee(input.userId);
    return {};
  } catch (error) {
    return formatError(error);
  }
}
