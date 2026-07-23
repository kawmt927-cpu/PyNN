import { UserRole } from "@prisma/client";
import { canEditCustomerFollowUp, getCustomerForUser } from "@/lib/customers/access";
import { getCustomerGradeLabel } from "@/lib/customers/grade";
import { getCustomerPendingFollowPlans } from "@/lib/follow-ups/unified";
import { formatPendingFollowUpRelativeLabel } from "@/lib/follow-ups/remaining-days";
import { prisma } from "@/lib/prisma";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { format } from "date-fns";

function truncate(text: string | null | undefined, max = 80): string {
  const s = text?.trim();
  if (!s) return "（无）";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function formatDateTime(d: Date): string {
  return format(d, "yyyy-MM-dd HH:mm");
}

export type CustomerBriefForAgent = {
  customerId: string;
  name: string;
  writable: boolean;
  customerGrade: string | null;
  customerGradeLabel: string;
  ownerName: string | null;
  assistants: string[];
  lastFollowUp: {
    at: string;
    method: string;
    content: string;
    result: string | null;
    by: string;
  } | null;
  nextFollowUp: {
    at: string;
    relativeLabel: string;
    overdue: boolean;
    method: string | null;
    content: string;
  } | null;
  pendingPlanCount: number;
};

export async function fetchCustomerBriefForAgent(
  customerId: string,
  role: UserRole,
  userId: string
): Promise<CustomerBriefForAgent | null> {
  const customer = await getCustomerForUser(customerId, role, userId);
  if (!customer) return null;

  const now = new Date();
  const [lastRow, pendingPlans] = await Promise.all([
    prisma.followUp.findFirst({
      where: { customerId },
      orderBy: { followUpAt: "desc" },
      select: {
        followUpAt: true,
        method: true,
        content: true,
        result: true,
        user: { select: { name: true } },
      },
    }),
    getCustomerPendingFollowPlans(customerId, now),
  ]);

  const next = pendingPlans[0];
  const nextRelative = next ? formatPendingFollowUpRelativeLabel(next.nextFollowUpAt, now) : null;

  return {
    customerId: customer.id,
    name: customer.name,
    writable: canEditCustomerFollowUp(role, userId, customer),
    customerGrade: customer.customerGrade,
    customerGradeLabel: getCustomerGradeLabel(customer.customerGrade) ?? "长期无意向客户",
    ownerName: customer.owner?.name ?? null,
    assistants: customer.assistantOwners.map((row) => row.user.name),
    lastFollowUp: lastRow
      ? {
          at: formatDateTime(lastRow.followUpAt),
          method: salesLogMethodLabel(lastRow.method),
          content: truncate(lastRow.content, 100),
          result: lastRow.result?.trim() || null,
          by: lastRow.user.name,
        }
      : null,
    nextFollowUp: next && nextRelative
      ? {
          at: formatDateTime(next.nextFollowUpAt),
          relativeLabel: nextRelative.label,
          overdue: nextRelative.overdue,
          method: next.nextFollowUpMethod
            ? salesLogMethodLabel(next.nextFollowUpMethod)
            : next.method
              ? salesLogMethodLabel(next.method)
              : null,
          content: truncate(next.content, 80),
        }
      : null,
    pendingPlanCount: pendingPlans.length,
  };
}

export function formatCustomerBriefForPrompt(brief: CustomerBriefForAgent): string {
  const lines = [
    `#### ${brief.name}（customerId: ${brief.customerId}）`,
    `- 当前等级：${brief.customerGradeLabel}${brief.writable ? "" : " · ⚠️ 非本人负责，不可代录"}`,
    `- 负责人：${brief.ownerName ?? "公海（无负责人）"}${brief.assistants.length ? ` · 协助：${brief.assistants.join("、")}` : ""}`,
  ];

  if (brief.lastFollowUp) {
    lines.push(
      `- 上次往来：${brief.lastFollowUp.at} · ${brief.lastFollowUp.method} · ${brief.lastFollowUp.by} · ${brief.lastFollowUp.content}` +
        (brief.lastFollowUp.result ? ` · 结果：${brief.lastFollowUp.result}` : "")
    );
  } else {
    lines.push("- 上次往来：暂无记录");
  }

  if (brief.nextFollowUp) {
    const prefix = brief.nextFollowUp.overdue ? "待跟进（已逾期）" : "计划下次跟进";
    lines.push(
      `- ${prefix}：${brief.nextFollowUp.relativeLabel} · ${brief.nextFollowUp.at}` +
        (brief.nextFollowUp.method ? ` · ${brief.nextFollowUp.method}` : "") +
        (brief.nextFollowUp.content !== "（无）" ? ` · ${brief.nextFollowUp.content}` : "")
    );
    if (brief.pendingPlanCount > 1) {
      lines.push(`- 另有 ${brief.pendingPlanCount - 1} 条待跟进计划`);
    }
  } else {
    lines.push("- 计划下次跟进：暂无");
  }

  return lines.join("\n");
}

export function customerBriefToToolPayload(brief: CustomerBriefForAgent) {
  return {
    customerId: brief.customerId,
    name: brief.name,
    writable: brief.writable,
    customerGrade: brief.customerGrade,
    customerGradeLabel: brief.customerGradeLabel,
    ownerName: brief.ownerName,
    assistants: brief.assistants,
    lastFollowUp: brief.lastFollowUp,
    nextFollowUp: brief.nextFollowUp,
    pendingPlanCount: brief.pendingPlanCount,
    displayHint: "销售自述后对照理解；写入或追问前可参考等级与跟进计划",
  };
}

export async function fetchCustomerBriefsForAgent(
  customerIds: string[],
  role: UserRole,
  userId: string,
  limit = 6
) {
  const unique = [...new Set(customerIds.filter(Boolean))].slice(0, limit);
  const briefs: CustomerBriefForAgent[] = [];
  for (const id of unique) {
    const brief = await fetchCustomerBriefForAgent(id, role, userId);
    if (brief) briefs.push(brief);
  }
  return briefs;
}
