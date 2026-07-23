import { UserRole } from "@prisma/client";
import {
  checkInRequiresFollowUp,
  listTodayCheckIns,
} from "@/lib/sales-log/check-in";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { listTodayFollowUps } from "@/lib/sales-log/today-follow-ups";
import {
  fetchCustomerBriefsForAgent,
  formatCustomerBriefForPrompt,
} from "@/lib/agent/customer-brief";

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

  const lines: string[] = [
    "## 今日工作快照（后台参考：销售自述后对照理解，开场勿抢先追问）",
    "",
  ];

  if (pendingCheckIns.length > 0) {
    lines.push(`### 待完善往来打卡（${pendingCheckIns.length} 条）`);
    for (const row of pendingCheckIns) {
      lines.push(
        `- checkInId: ${row.id} · ${row.customer?.name ?? "未知客户"} · ${formatTime(row.checkedInAt)} · ${formatCheckInLocation(row)}` +
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
    lines.push("### 系统内尚无今日打卡或往来");
    lines.push("- 销售自述后，按描述记进系统即可。");
    lines.push("");
  }

  const briefCustomerIds = [
    ...pendingCheckIns.map((row) => row.customer?.id),
    ...standaloneFollowUps.map((row) => row.customer.id),
    ...completedCheckIns.map((row) => row.customer?.id),
  ].filter((id): id is string => Boolean(id));

  const customerBriefs = await fetchCustomerBriefsForAgent(briefCustomerIds, role, userId);
  if (customerBriefs.length > 0) {
    lines.push("### 相关客户档案摘要（写入或追问前参考，不必在开场播报）");
    for (const brief of customerBriefs) {
      lines.push(formatCustomerBriefForPrompt(brief));
      lines.push("");
    }
  }

  lines.push("### 使用说明");
  lines.push("- 销售先自述；自述后再对照本快照匹配打卡并写入。");
  lines.push("- 打卡与权限自己看本快照/工具，禁止问销售「有没有打卡」「能不能写」。");
  lines.push("- 信息清楚则直接写入；仅缺失、矛盾、无权限、建档改商机时才追问（每次一个问题）。");
  lines.push("- 可写时不要向销售汇报负责人/协助负责人等正常事实；仅不可写时才说明需联系负责人。");

  return lines.join("\n");
}
