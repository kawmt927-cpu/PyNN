import type { FollowUpMethod, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isWeComConfigured } from "@/lib/wecom/config";
import { sendWeComTextNoticeCard } from "@/lib/wecom/app-message";
import { recipientRolesForActor } from "@/lib/notifications/app-notifications";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { formatPendingFollowUpRelativeLabel } from "@/lib/follow-ups/remaining-days";
import { mobileActivityHref } from "@/lib/today-work/activity-open";

function formatDateTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function previewText(text: string, max = 120) {
  return text.replace(/[#>*`_\-\[\]()]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function methodLabelOf(method: string) {
  return (
    FOLLOW_UP_METHOD_LABELS[method as keyof typeof FOLLOW_UP_METHOD_LABELS] ??
    salesLogMethodLabel(method as FollowUpMethod) ??
    method
  );
}

async function resolveWeComUserIds(crmUserIds: string[]): Promise<string[]> {
  const ids = [...new Set(crmUserIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: ids },
      wecomUserId: { not: null },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { wecomUserId: true },
  });
  return users
    .map((u) => u.wecomUserId?.trim())
    .filter((id): id is string => Boolean(id));
}

async function listManagerCrmUserIds(actorRole: UserRole, excludeUserId?: string | null) {
  const roles = recipientRolesForActor(actorRole);
  const users = await prisma.user.findMany({
    where: {
      role: { in: roles },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** 按 CRM 用户 id 发企微文本卡片（静默失败；不写站内通知） */
export async function pushWeComTextCardToCrmUsers(input: {
  crmUserIds: string[];
  title: string;
  description: string;
  url: string;
  btnText?: string;
  fields?: { keyname: string; value: string }[];
  quoteTitle?: string;
  quoteText?: string;
}) {
  if (!isWeComConfigured()) return;
  const wecomUserIds = await resolveWeComUserIds(input.crmUserIds);
  if (wecomUserIds.length === 0) return;
  await sendWeComTextNoticeCard({
    wecomUserIds,
    title: input.title,
    subtitle: input.description,
    fields: input.fields,
    quoteTitle: input.quoteTitle,
    quoteText: input.quoteText,
    url: input.url,
    btnText: input.btnText,
  });
}

/** 日报提交：仅企微通知本人 + 上级（不写站内通知） */
export async function notifyWeComDailyLogSubmitted(input: {
  actorUserId: string;
  actorRole: UserRole;
  actorName: string;
  dailyLogId: string;
  dailyReport: string;
  tomorrowPlan?: string | null;
  riskFlag?: boolean;
}) {
  try {
    const managerIds = await listManagerCrmUserIds(input.actorRole, input.actorUserId);
    const recipientIds = [input.actorUserId, ...managerIds];
    const summary = previewText(input.dailyReport, 160);
    const plan = previewText(input.tomorrowPlan ?? "", 80);
    const title = input.riskFlag ? "日报提交通知（含风险）" : "日报提交通知";
    const description = `${input.actorName} 已提交今日工作日报，请知悉！`;
    const linkHref = mobileActivityHref({ kind: "daily_log", id: input.dailyLogId });

    await pushWeComTextCardToCrmUsers({
      crmUserIds: recipientIds,
      title,
      description,
      quoteTitle: "今日总结",
      quoteText: summary || "点击查看详情",
      fields: [
        { keyname: "提交人", value: input.actorName },
        { keyname: "提交时间", value: formatDateTime(new Date()) },
        ...(plan ? [{ keyname: "明日计划", value: plan }] : []),
        ...(input.riskFlag ? [{ keyname: "风险", value: "已标记风险" }] : []),
      ],
      url: linkHref,
    });
  } catch (error) {
    console.error("[wecom-notify] daily log", error);
  }
}

/** 往来录入：仅企微通知本人 + 上级（不写站内通知） */
export async function notifyWeComFollowUpCreated(input: {
  actorUserId: string;
  actorRole: UserRole;
  actorName: string;
  followUpId: string;
  customerId: string;
  customerName: string;
  method: keyof typeof FOLLOW_UP_METHOD_LABELS | string;
  content: string;
  contactName?: string | null;
  nextFollowUpAt?: Date | string | null;
  nextFollowUpMethod?: string | null;
  nextFollowUpContent?: string | null;
}) {
  try {
    const managerIds = await listManagerCrmUserIds(input.actorRole, input.actorUserId);
    const recipientIds = [input.actorUserId, ...managerIds];
    const methodLabel = methodLabelOf(String(input.method));
    const content = previewText(input.content, 160);
    const nextAt = input.nextFollowUpAt
      ? input.nextFollowUpAt instanceof Date
        ? input.nextFollowUpAt
        : new Date(input.nextFollowUpAt)
      : null;
    const nextRelative =
      nextAt && !Number.isNaN(nextAt.getTime())
        ? formatPendingFollowUpRelativeLabel(nextAt)
        : null;
    const nextMethod = input.nextFollowUpMethod
      ? methodLabelOf(String(input.nextFollowUpMethod))
      : null;
    const nextPlanLine = nextRelative
      ? ["下次跟进", nextRelative.label, nextMethod, formatDateTime(nextAt!)]
          .filter(Boolean)
          .join(" · ")
      : null;

    const quoteParts = [
      content || "已记录往来",
      input.nextFollowUpContent ? previewText(input.nextFollowUpContent, 60) : null,
    ].filter(Boolean);

    const title = "提交往来提醒";
    const description = `${input.actorName} · ${methodLabel} · ${input.customerName}`;
    const linkHref = mobileActivityHref({ kind: "follow_up", id: input.followUpId });

    await pushWeComTextCardToCrmUsers({
      crmUserIds: recipientIds,
      title,
      description,
      quoteTitle: "往来日志",
      quoteText: quoteParts.join("\n"),
      fields: [
        { keyname: "客户名称", value: input.customerName },
        ...(input.contactName
          ? [{ keyname: "联系人", value: input.contactName }]
          : []),
        { keyname: "往来方式", value: methodLabel },
        { keyname: "记录时间", value: formatDateTime(new Date()) },
        ...(nextRelative
          ? [{ keyname: "下次跟进", value: `${nextRelative.label}${nextMethod ? ` · ${nextMethod}` : ""}` }]
          : []),
      ],
      url: linkHref,
    });
  } catch (error) {
    console.error("[wecom-notify] follow-up", error);
  }
}
