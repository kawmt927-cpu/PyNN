import type { PersonnelHrDocumentKind } from "@prisma/client";

export const HR_DOCUMENT_KIND_LABELS: Record<PersonnelHrDocumentKind, string> = {
  ID_CARD: "身份证",
  CERTIFICATE: "证书",
  EMPLOYMENT_CONTRACT: "劳动合同",
  NDA: "保密协议",
};

export const HR_DOCUMENT_KINDS: PersonnelHrDocumentKind[] = [
  "ID_CARD",
  "CERTIFICATE",
  "EMPLOYMENT_CONTRACT",
  "NDA",
];

export function isOcrDocumentKind(kind: PersonnelHrDocumentKind) {
  return kind === "ID_CARD" || kind === "CERTIFICATE";
}

export function defaultHrDocumentTitle(kind: PersonnelHrDocumentKind) {
  return HR_DOCUMENT_KIND_LABELS[kind];
}

export function formatDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateInput(raw: string | null | undefined): Date | null {
  const text = raw?.trim() ?? "";
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}
