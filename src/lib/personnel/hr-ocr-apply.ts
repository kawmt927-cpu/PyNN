import type { PersonnelHrDocumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defaultHrDocumentTitle, parseDateInput } from "@/lib/personnel/hr-documents";
import { extractHrDocumentFieldsFromFile } from "@/lib/personnel/hr-document-ocr";

export async function applyHrDocumentOcr(input: {
  userId: string;
  documentId: string;
  kind: PersonnelHrDocumentKind;
  overwrite: boolean;
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}) {
  const result = await extractHrDocumentFieldsFromFile({
    kind: input.kind,
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
  const document = await prisma.personnelHrDocument.findFirst({
    where: { id: input.documentId, userId: input.userId },
  });
  if (!document) throw new Error("证件不存在");

  const issuedAt = parseDateInput(result.issuedAt);
  const expiresAt = parseDateInput(result.expiresAt);
  const nextTitle =
    input.kind === "CERTIFICATE" && result.title?.trim() ? result.title.trim() : null;

  await prisma.personnelHrDocument.update({
    where: { id: document.id },
    data: {
      title:
        nextTitle && (input.overwrite || document.title === defaultHrDocumentTitle(input.kind))
          ? nextTitle
          : undefined,
      issuedAt: issuedAt && (input.overwrite || !document.issuedAt) ? issuedAt : undefined,
      expiresAt: expiresAt && (input.overwrite || !document.expiresAt) ? expiresAt : undefined,
    },
  });

  if (input.kind === "ID_CARD" && (result.idNumber || expiresAt)) {
    const profile = await prisma.personnelHrProfile.findUnique({
      where: { userId: input.userId },
    });
    const idNumber =
      result.idNumber && (input.overwrite || !profile?.idNumber) ? result.idNumber : undefined;
    const idExpiresAt =
      expiresAt && (input.overwrite || !profile?.idExpiresAt) ? expiresAt : undefined;
    if (idNumber !== undefined || idExpiresAt !== undefined) {
      await prisma.personnelHrProfile.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          idNumber: idNumber ?? null,
          idExpiresAt: idExpiresAt ?? null,
        },
        update: {
          ...(idNumber !== undefined ? { idNumber } : {}),
          ...(idExpiresAt !== undefined ? { idExpiresAt } : {}),
        },
      });
    }
  }

  return result;
}
