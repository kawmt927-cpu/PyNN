import { UserRole } from "@prisma/client";
import {
  checkInRequiresFollowUp,
  listTodayCheckIns,
} from "@/lib/sales-log/check-in";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { listTodayFollowUps } from "@/lib/sales-log/today-follow-ups";

function formatTime(iso: Date | string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function truncate(text: string | null | undefined, max = 80): string {
  const s = text?.trim();
  if (!s) return "（无摘要）";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** 为 AI 助理构建当日工作快照，注入 system prompt */
export async function buildTodayWorkContextForAgent(role: UserRole, userId: string): Promise<string> {
  const [checkIns, followUps] = await Promise.all([
    listTodayCheckIns(role, userId),
    listTodayFollowUps(role, userId),
  ]);

  const pendingCheckIns = checkIns.filter((row) => checkInRequiresFollowUp(row));
  const completedCheckIns = checkIns.filter((row) => !checkInRequiresFollowUp(row));
  const standaloneFollowUps = followUps.filter((row) => !row.salesCheckIn);

  const lines: string[] = ["## 今日工作快照（系统已注入，对话开始时请据此主动追问）", ""];

  if (pendingCheckIns.length > 0) {
    lines.push(`### 待完善往来打卡（${pendingCheckIns.length} 条，优先处理）`);
    for (const row of pendingCheckIns) {
      lines.push(
        `- id=${row.id} · ${row.customer?.name ?? "未知客户"} · ${formatTime(row.checkedInAt)} · ${formatCheckInLocation(row)}` +
          (row.contact?.name ? ` · 联系人 ${row.contact.name}` : "") +
          (row.notes?.trim() ? ` · 备注：${truncate(row.notes, 40)}` : "")
      );
    }
    lines.push("");
  }

  if (completedCheckIns.length > 0) {
    lines.push(`### 今日打卡（已完善或无客户，${completedCheckIns.length} 条）`);
    for (const row of completedCheckIns) {
      const label = row.customer?.name ?? "无客户打卡";
      const detail = row.followUp
        ? ` · 已录入 ${salesLogMethodLabel(row.followUp.method)}：${truncate(row.followUp.content, 50)}`
        : row.customerId
          ? " · 已完善"
          : " · 仅定位";
      lines.push(`- ${label} · ${formatTime(row.checkedInAt)}${detail}`);
    }
    lines.push("");
  }

  if (standaloneFollowUps.length > 0) {
    lines.push(`### 今日已录入往来（非打卡来源，${standaloneFollowUps.length} 条）`);
    for (const row of standaloneFollowUps) {
      lines.push(
        `- ${row.customer.name} · ${salesLogMethodLabel(row.method)} · ${formatTime(row.followUpAt)} · ${truncate(row.content, 60)}` +
          (row.result?.trim() ? ` · 结果：${truncate(row.result, 40)}` : "")
      );
    }
    lines.push("");
  }

  if (checkIns.length === 0 && followUps.length === 0) {
    lines.push("### 今日尚无打卡或往来记录");
    lines.push("- 请主动询问销售今天见了哪些客户、电话/微信沟通情况，再落库。");
    lines.push("");
  } else if (pendingCheckIns.length === 0) {
    lines.push("### 待办提示");
    lines.push("- 所有往来打卡已完善。请核对已录入往来是否完整，补充遗漏的客户/沟通，或引导销售说「生成日报」收尾。");
    lines.push("");
  }

  lines.push("### 开场要求");
  if (pendingCheckIns.length > 0) {
    const first = [...pendingCheckIns].sort(
      (a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime()
    )[0];
    lines.push(
      `- 第一条待完善打卡：${first.customer?.name}（${formatTime(first.checkedInAt)}）。开场用一句话点出该客户，只问一个最关键问题（见了谁/聊了什么/下一步）。`
    );
  } else if (followUps.length > 0) {
    lines.push("- 无待完善打卡。简要概括今日已记录工作，问是否还有遗漏的客户或沟通。");
  } else {
    lines.push("- 无系统记录。友好开场，问今天主要跟进了哪些客户。");
  }

  return lines.join("\n");
}
