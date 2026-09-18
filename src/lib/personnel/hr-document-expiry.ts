import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { PersonnelHrDocumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createAppNotification,
  NOTIFICATION_TYPES,
} from "@/lib/notifications/app-notifications";
import { HR_DOCUMENT_KIND_LABELS } from "@/lib/personnel/hr-documents";

export const HR_DOCUMENT_SOON_DAYS = 30;

export type HrExpiryStatus = "expired" | "soon" | "ok";

export type HrExpiryItem = {
  key: string;
  userId: string;
  userName: string;
  kind: PersonnelHrDocumentKind | "PROFILE_ID";
  title: string;
  expiresAt: Date;
  daysLeft: number;
  status: HrExpiryStatus;
};

export function classifyExpiry(expiresAt: Date, now = new Date()): HrExpiryStatus {
  const days = differenceInCalendarDays(startOfDay(expiresAt), startOfDay(now));
  if (days < 0) return "expired";
  if (days <= HR_DOCUMENT_SOON_DAYS) return "soon";
  return "ok";
}

function toItem(input: {
  key: string;
  userId: string;
  userName: string;
  kind: HrExpiryItem["kind"];
  title: string;
  expiresAt: Date;
  now: Date;
}): HrExpiryItem {
  const daysLeft = differenceInCalendarDays(startOfDay(input.expiresAt), startOfDay(input.now));
  return {
    ...input,
    daysLeft,
    status: classifyExpiry(input.expiresAt, input.now),
  };
}

export async function listHrDocumentExpiryItems(now = new Date()): Promise<HrExpiryItem[]> {
  const [users, documents] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        personnelHrProfile: { select: { idExpiresAt: true } },
      },
    }),
    prisma.personnelHrDocument.findMany({
      where: { expiresAt: { not: null } },
      select: {
        id: true,
        userId: true,
        kind: true,
        title: true,
        expiresAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const items: HrExpiryItem[] = [];
  const usersWithIdCardExpiry = new Set(
    documents
      .filter((d) => d.kind === "ID_CARD" && d.expiresAt)
      .map((d) => d.userId)
  );

  for (const doc of documents) {
    if (!doc.expiresAt) continue;
    items.push(
      toItem({
        key: `doc:${doc.id}`,
        userId: doc.userId,
        userName: doc.user.name,
        kind: doc.kind,
        title: doc.title || HR_DOCUMENT_KIND_LABELS[doc.kind],
        expiresAt: doc.expiresAt,
        now,
      })
    );
  }

  for (const user of users) {
    const exp = user.personnelHrProfile?.idExpiresAt;
    if (!exp || usersWithIdCardExpiry.has(user.id)) continue;
    items.push(
      toItem({
        key: `profile:${user.id}:idExpiresAt`,
        userId: user.id,
        userName: user.name,
        kind: "PROFILE_ID",
        title: "身份证",
        expiresAt: exp,
        now,
      })
    );
  }

  return items
    .filter((item) => item.status !== "ok")
    .sort((a, b) => a.daysLeft - b.daysLeft || a.userName.localeCompare(b.userName, "zh-CN"));
}

function expiryPhrase(item: HrExpiryItem) {
  const date = item.expiresAt.toLocaleDateString("zh-CN");
  if (item.status === "expired") {
    return `已于 ${date} 过期`;
  }
  if (item.daysLeft === 0) return `今天（${date}）到期`;
  return `将于 ${date} 到期（还剩 ${item.daysLeft} 天）`;
}

export async function runHrDocumentExpiryRemindJob(now = new Date()): Promise<{
  scanned: number;
  notified: number;
  skipped: number;
}> {
  const items = await listHrDocumentExpiryItems(now);
  const dayStart = startOfDay(now);
  const existing = await prisma.appNotification.findMany({
    where: {
      type: NOTIFICATION_TYPES.HR_DOCUMENT_EXPIRY,
      createdAt: { gte: dayStart },
    },
    select: { metaJson: true },
  });
  const already = new Set<string>();
  for (const row of existing) {
    if (!row.metaJson) continue;
    try {
      const meta = JSON.parse(row.metaJson) as { key?: unknown };
      if (typeof meta.key === "string") already.add(meta.key);
    } catch {
      // ignore
    }
  }

  const recipients = await prisma.user.findMany({
    where: {
      role: { in: ["HR", "ADMIN"] },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true },
  });
  const recipientUserIds = recipients.map((u) => u.id);

  let notified = 0;
  let skipped = 0;
  for (const item of items) {
    if (already.has(item.key)) {
      skipped += 1;
      continue;
    }
    if (recipientUserIds.length === 0) break;
    const kindLabel =
      item.kind === "PROFILE_ID" ? "身份证" : HR_DOCUMENT_KIND_LABELS[item.kind];
    await createAppNotification({
      type: NOTIFICATION_TYPES.HR_DOCUMENT_EXPIRY,
      title: `${item.status === "expired" ? "证件已过期" : "证件即将到期"}：${item.userName} · ${kindLabel}`,
      body: `${item.title} ${expiryPhrase(item)}`,
      linkHref: `/hr/employees/${item.userId}`,
      meta: {
        key: item.key,
        userId: item.userId,
        kind: item.kind,
        expiresAt: item.expiresAt.toISOString(),
      },
      recipientUserIds,
      pushWeCom: true,
    });
    notified += 1;
  }

  return { scanned: items.length, notified, skipped };
}
