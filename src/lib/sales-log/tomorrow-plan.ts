/** 明日计划校验：提交日报前须含具体事项 + 预计成果 */

const VAGUE_EXACT = new Set([
  "待安排",
  "待定",
  "未定",
  "暂无",
  "无",
  "无计划",
  "再说",
  "看情况",
  "等通知",
  "等他通知",
  "继续跟进",
  "跟进客户",
  "待确认",
  "不确定",
  "tbd",
]);

const VAGUE_PREFIX = /^继续跟进[。．!！]?$/;
const VAGUE_SHORT_FOLLOW_UP = /^继续跟进.{0,6}[。．!！]?$/;

export function validateTomorrowPlan(plan: string | undefined | null): string | null {
  const text = plan?.trim() ?? "";
  if (!text) {
    return "明日计划不能为空。提交前须向销售追问：明天具体做什么、预计拿到什么结果。";
  }

  if (text.length < 10) {
    return "明日计划过短。须写明具体事项与预计成果，例如：「明天电话兴化人民医院卞主任，确认副院长线下沟通时间，预计敲定9月会议安排」。";
  }

  const compact = text.replace(/\s+/g, "");
  if (VAGUE_EXACT.has(compact.toLowerCase())) {
    return "明日计划不能为「待安排/待定/继续跟进」等敷衍表述，请向销售追问具体事项与预计成果。";
  }

  if (VAGUE_PREFIX.test(compact) || VAGUE_SHORT_FOLLOW_UP.test(compact)) {
    return "「继续跟进」过于笼统。请追问：跟哪家客户、用什么方式、谈什么、预计拿到什么结果。";
  }

  if (/^待安排/.test(compact) && compact.length <= 8) {
    return "明日计划不能写「待安排」。请向销售追问明天的具体安排与预计成果。";
  }

  const hasOutcomeHint =
    /预计|成果|目标|拿到|完成|提交|发送|敲定|确认|推进|落实|拜访|面访|电话|微信|联系|方案|报价|演示|会议|签约|回款|立项/.test(
      text
    );
  if (!hasOutcomeHint) {
    return "明日计划须包含预计成果或具体动作（如预计确认时间、提交方案、完成拜访等），请向销售补问。";
  }

  return null;
}

export function extractTomorrowPlanFromReport(report: string): string | null {
  const match = report.match(
    /(?:^|\n)#+\s*明日计划\s*\n+([\s\S]*?)(?=\n#+\s|\n*$)/i
  );
  const block = match?.[1]?.trim();
  if (!block) return null;
  const lines = block
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.)]+\s*/, "").trim())
    .filter(Boolean);
  return lines.join("；") || null;
}

export function resolveTomorrowPlanForSubmit(input: {
  tomorrowPlan?: string | null;
  dailyReport: string;
}): string {
  return (
    input.tomorrowPlan?.trim() ||
    extractTomorrowPlanFromReport(input.dailyReport) ||
    ""
  );
}
