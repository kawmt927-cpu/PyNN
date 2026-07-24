/**
 * 历史日报 Excel 清洗合并 → 生成待审工作簿（不入库）。
 *
 * 用法：
 *   npx tsx scripts/legacy-daily-log-clean.ts
 *   npx tsx scripts/legacy-daily-log-clean.ts --input "/path/to.xlsx"
 *
 * 默认输入：~/Downloads/crm 历史日志.xlsx
 * 默认输出：~/Downloads/培安CRM-历史日报清洗待审.xlsx
 */
import ExcelJS from "exceljs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { extractTomorrowPlanFromReport } from "../src/lib/sales-log/tomorrow-plan";

const HOME = process.env.HOME || "/Users/wanjianan";
const DEFAULT_INPUT = path.join(HOME, "Downloads", "crm 历史日志.xlsx");
const DEFAULT_OUTPUT = path.join(HOME, "Downloads", "培安CRM-历史日报清洗待审.xlsx");
const IMPORT_SOURCE = "legacy-daily-log";
const BATCH_ID = `legacy-daily-log-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const INPUT = argValue("--input") || DEFAULT_INPUT;
const OUTPUT = argValue("--output") || DEFAULT_OUTPUT;

type RawRow = {
  sourceRow: number;
  reporter: string;
  reportDate: string;
  status: string;
  todaySummary: string;
  tomorrowPlan: string;
  issues: string;
  submittedAt: string;
  submittedAtMs: number;
  createdAt: string;
  reviewer: string;
  comment: string;
  visits: string;
};

type CleanRow = {
  reporter: string;
  userMatched: boolean;
  userId: string | null;
  logDate: string;
  dailyReport: string;
  tomorrowPlan: string;
  submittedAt: string;
  sourceRows: string;
  mergeNote: string;
  importSource: string;
  importBatch: string;
};

function cleanText(raw: unknown): string {
  if (raw == null) return "";
  let s = typeof raw === "string" ? raw : String(raw);
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    const hh = String(raw.getHours()).padStart(2, "0");
    const mm = String(raw.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }
  return s
    .replace(/\uFFFC/g, "")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return cleanText(v);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date
    if (v > 20000 && v < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + v * 86400000);
      return cleanText(d);
    }
    return String(v);
  }
  return cleanText(v);
}

function toDayKey(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, "0");
  const d = m[3].padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function parseDateTimeMs(raw: string): number {
  const s = raw.trim().replace(/-/g, "/");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function isMeaningfulVisits(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[\d.。、\s]+$/.test(t)) return false;
  if (t.length < 8) return false;
  return true;
}

function isMeaningfulIssues(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(无|暂无|无问题|每日一问[，,、]?\s*暂无[!！]?)$/i.test(t)) return false;
  return t.length >= 2;
}

function bodyHasIssueSection(body: string): boolean {
  return /问题汇总|问题与风险|##\s*问题/.test(body);
}

function bodyHasVisitSection(body: string): boolean {
  return /历史往来摘录/.test(body);
}

function extractTomorrowPlanLoose(body: string): string | null {
  const fromMd = extractTomorrowPlanFromReport(body);
  if (fromMd?.trim()) return fromMd.trim();

  // 旧 CRM 常见：「明日计划：」或「【明日计划】」无 Markdown 标题
  const match = body.match(
    /(?:^|\n)\s*(?:【\s*)?明日计划(?:\s*】)?\s*[:：]?\s*\n+([\s\S]*?)(?=\n\s*(?:【\s*)?(?:今日|问题|往来|内部)|$)/i
  );
  const block = match?.[1]?.trim();
  if (!block) return null;
  const lines = block
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.)]+\s*/, "").trim())
    .filter(Boolean);
  return lines.join("；") || null;
}

function resolveTomorrowPlan(column: string, body: string): string {
  const fromCol = column.trim();
  if (fromCol) return fromCol;
  return extractTomorrowPlanLoose(body) || "";
}

function buildDailyReportParts(input: {
  todaySummary: string;
  issues: string;
  visits: string;
}): { dailyReport: string; appendedIssues: boolean; appendedVisits: boolean } {
  let body = input.todaySummary.trim();
  let appendedIssues = false;
  let appendedVisits = false;

  if (isMeaningfulIssues(input.issues) && !bodyHasIssueSection(body)) {
    body = `${body}\n\n## 问题与风险\n${input.issues.trim()}`;
    appendedIssues = true;
  }

  if (isMeaningfulVisits(input.visits) && !bodyHasVisitSection(body)) {
    body = `${body}\n\n## 历史往来摘录\n${input.visits.trim()}`;
    appendedVisits = true;
  }

  return { dailyReport: body.trim(), appendedIssues, appendedVisits };
}

async function readRawRows(filePath: string): Promise<RawRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel 无工作表");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cleanText(cell.value);
  });

  const idx = (name: string) => headers.findIndex((h) => h === name);
  const iReporter = idx("报告人");
  const iDate = idx("报告日期");
  const iStatus = idx("状态");
  const iToday = idx("今日汇总");
  const iTomorrow = idx("明日计划");
  const iIssues = idx("问题汇总");
  const iSubmit = idx("提交时间");
  const iCreated = idx("创建时间");
  const iReviewer = idx("审阅人");
  const iComment = idx("评论");
  const iVisits = idx("往来信息");

  if (iReporter < 0 || iDate < 0 || iToday < 0) {
    throw new Error(`表头缺少必要列，实际: ${headers.filter(Boolean).join(", ")}`);
  }

  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (i: number) => (i >= 0 ? cellStr(row.getCell(i + 1).value) : "");
    const reporter = get(iReporter);
    const reportDateRaw = get(iDate);
    const todaySummary = get(iToday);
    if (!reporter && !reportDateRaw && !todaySummary) return;

    const submittedAt = get(iSubmit) || get(iCreated);
    rows.push({
      sourceRow: rowNumber,
      reporter,
      reportDate: reportDateRaw,
      status: get(iStatus),
      todaySummary,
      tomorrowPlan: get(iTomorrow),
      issues: get(iIssues),
      submittedAt,
      submittedAtMs: parseDateTimeMs(submittedAt),
      createdAt: get(iCreated),
      reviewer: get(iReviewer),
      comment: get(iComment),
      visits: get(iVisits),
    });
  });
  return rows;
}

function mergeGroup(group: RawRow[]): {
  clean: Omit<CleanRow, "userMatched" | "userId">;
  conflict: boolean;
  discardedVisitShort: number;
} {
  const sorted = [...group].sort((a, b) => b.submittedAtMs - a.submittedAtMs);
  const primary = sorted[0];
  const dayKey = toDayKey(primary.reportDate);
  if (!dayKey) {
    throw new Error(`无法解析报告日期: row=${primary.sourceRow} value=${primary.reportDate}`);
  }

  let discardedVisitShort = 0;
  for (const r of group) {
    const v = r.visits.trim();
    if (v && !isMeaningfulVisits(v)) discardedVisitShort += 1;
  }

  const parts = buildDailyReportParts({
    todaySummary: primary.todaySummary,
    issues: primary.issues,
    visits: primary.visits,
  });
  let body = parts.dailyReport;
  const mergeNotes: string[] = [];

  if (sorted.length > 1) {
    mergeNotes.push(`同人同日合并 ${sorted.length} 行，主行=源行${primary.sourceRow}（提交最晚）`);
    for (const extra of sorted.slice(1)) {
      if (isMeaningfulIssues(extra.issues) && !bodyHasIssueSection(body)) {
        body = `${body}\n\n## 问题与风险\n${extra.issues.trim()}`;
        mergeNotes.push(`从源行${extra.sourceRow}追加问题汇总`);
      }
      if (isMeaningfulVisits(extra.visits) && !bodyHasVisitSection(body)) {
        body = `${body}\n\n## 历史往来摘录\n${extra.visits.trim()}`;
        mergeNotes.push(`从源行${extra.sourceRow}追加往来信息`);
      } else if (isMeaningfulVisits(extra.visits) && bodyHasVisitSection(body)) {
        // 主行已有往来时，把其它行有实质差异的往来追加
        const extraVisits = extra.visits.trim();
        if (!body.includes(extraVisits.slice(0, Math.min(40, extraVisits.length)))) {
          body = `${body}\n\n${extraVisits}`;
          mergeNotes.push(`从源行${extra.sourceRow}追加往来片段`);
        }
      }
    }
  }

  const tomorrowPlan = resolveTomorrowPlan(primary.tomorrowPlan, body);
  // 若主行列为空，尝试从其它行取明日计划
  let tomorrow = tomorrowPlan;
  if (!tomorrow) {
    for (const r of sorted) {
      const t = resolveTomorrowPlan(r.tomorrowPlan, r.todaySummary);
      if (t) {
        tomorrow = t;
        mergeNotes.push(`明日计划取自源行${r.sourceRow}`);
        break;
      }
    }
  }

  return {
    clean: {
      reporter: primary.reporter,
      logDate: dayKey,
      dailyReport: body.trim(),
      tomorrowPlan: tomorrow,
      submittedAt: primary.submittedAt || `${dayKey} 23:59`,
      sourceRows: sorted.map((r) => String(r.sourceRow)).join(","),
      mergeNote: mergeNotes.join("；"),
      importSource: IMPORT_SOURCE,
      importBatch: BATCH_ID,
    },
    conflict: sorted.length > 1,
    discardedVisitShort,
  };
}

async function loadUserNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const prisma = new PrismaClient();
    const users = await prisma.user.findMany({ select: { id: true, name: true } });
    await prisma.$disconnect();
    for (const u of users) {
      const name = u.name.trim();
      if (name && !map.has(name)) map.set(name, u.id);
    }
  } catch (e) {
    console.warn("无法连接数据库做人员预匹配，将全部记入人员核对表:", (e as Error).message);
  }
  return map;
}

function writeSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Record<string, unknown>[]
) {
  const ws = wb.addWorksheet(name);
  ws.addRow(headers);
  for (const row of rows) {
    ws.addRow(headers.map((h) => row[h] ?? ""));
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

async function main() {
  console.log("读取:", INPUT);
  const raw = await readRawRows(INPUT);
  console.log("原始行数:", raw.length);

  const userMap = await loadUserNameMap();
  const groups = new Map<string, RawRow[]>();
  const badDate: RawRow[] = [];

  for (const row of raw) {
    const day = toDayKey(row.reportDate);
    if (!day || !row.reporter) {
      badDate.push(row);
      continue;
    }
    const key = `${row.reporter}@@${day}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const importable: CleanRow[] = [];
  const conflicts: Record<string, unknown>[] = [];
  const unmatchedNames = new Set<string>();
  let discardedVisitShort = 0;
  let conflictGroups = 0;

  for (const [, group] of groups) {
    const { clean, conflict, discardedVisitShort: d } = mergeGroup(group);
    discardedVisitShort += d;
    const userId = userMap.get(clean.reporter) ?? null;
    const userMatched = Boolean(userId);
    if (!userMatched) unmatchedNames.add(clean.reporter);

    importable.push({
      ...clean,
      userMatched,
      userId,
    });

    if (conflict) {
      conflictGroups += 1;
      conflicts.push({
        报告人: clean.reporter,
        报告日期: clean.logDate,
        合并行数: group.length,
        源行号: clean.sourceRows,
        合并说明: clean.mergeNote,
        主行提交时间: clean.submittedAt,
      });
    }
  }

  importable.sort((a, b) => {
    const c = a.logDate.localeCompare(b.logDate);
    if (c !== 0) return c;
    return a.reporter.localeCompare(b.reporter, "zh-CN");
  });

  const comments = raw
    .filter((r) => r.comment.trim())
    .map((r) => ({
      源行号: r.sourceRow,
      报告人: r.reporter,
      报告日期: toDayKey(r.reportDate) || r.reportDate,
      评论: r.comment,
      审阅人: r.reviewer,
      状态: r.status,
    }));

  const wb = new ExcelJS.Workbook();
  writeSheet(
    wb,
    "可导入日报",
    [
      "报告人",
      "userMatched",
      "userId",
      "logDate",
      "dailyReport",
      "tomorrowPlan",
      "submittedAt",
      "sourceRows",
      "mergeNote",
      "importSource",
      "importBatch",
    ],
    importable.map((r) => ({
      报告人: r.reporter,
      userMatched: r.userMatched ? "Y" : "N",
      userId: r.userId ?? "",
      logDate: r.logDate,
      dailyReport: r.dailyReport,
      tomorrowPlan: r.tomorrowPlan,
      submittedAt: r.submittedAt,
      sourceRows: r.sourceRows,
      mergeNote: r.mergeNote,
      importSource: r.importSource,
      importBatch: r.importBatch,
    }))
  );

  writeSheet(
    wb,
    "人员未匹配",
    ["报告人", "出现天数", "原始行数"],
    [...unmatchedNames]
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
      .map((name) => ({
        报告人: name,
        出现天数: importable.filter((r) => r.reporter === name).length,
        原始行数: raw.filter((r) => r.reporter === name).length,
      }))
  );

  writeSheet(wb, "同人同日冲突", ["报告人", "报告日期", "合并行数", "源行号", "合并说明", "主行提交时间"], conflicts);

  writeSheet(wb, "丢弃评论留存", ["源行号", "报告人", "报告日期", "评论", "审阅人", "状态"], comments);

  writeSheet(
    wb,
    "统计",
    ["项", "值"],
    [
      { 项: "输入文件", 值: INPUT },
      { 项: "批次", 值: BATCH_ID },
      { 项: "原始行数", 值: raw.length },
      { 项: "可导入条数(人日)", 值: importable.length },
      { 项: "人员已匹配条数", 值: importable.filter((r) => r.userMatched).length },
      { 项: "人员未匹配条数", 值: importable.filter((r) => !r.userMatched).length },
      { 项: "未匹配报告人", 值: [...unmatchedNames].join("、") || "无" },
      { 项: "同人同日冲突组数", 值: conflictGroups },
      { 项: "往来过短丢弃次数", 值: discardedVisitShort },
      { 项: "日期无法解析行数", 值: badDate.length },
      { 项: "有评论留存条数", 值: comments.length },
      { 项: "有明日计划条数", 值: importable.filter((r) => r.tomorrowPlan).length },
      { 项: "含历史往来摘录条数", 值: importable.filter((r) => bodyHasVisitSection(r.dailyReport)).length },
    ]
  );

  if (badDate.length) {
    writeSheet(
      wb,
      "日期异常",
      ["源行号", "报告人", "报告日期", "今日汇总摘要"],
      badDate.map((r) => ({
        源行号: r.sourceRow,
        报告人: r.reporter,
        报告日期: r.reportDate,
        今日汇总摘要: r.todaySummary.slice(0, 80),
      }))
    );
  }

  await wb.xlsx.writeFile(OUTPUT);
  console.log("已写出:", OUTPUT);
  console.log(
    `可导入 ${importable.length} 人日；未匹配人员 ${unmatchedNames.size} 名；冲突组 ${conflictGroups}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
