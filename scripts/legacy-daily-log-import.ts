/**
 * 将「历史日报清洗待审」Excel 导入本地数据库（SalesDailyLog）。
 *
 * 用法：
 *   npx tsx scripts/legacy-daily-log-import.ts
 *   npx tsx scripts/legacy-daily-log-import.ts --dry-run
 *   npx tsx scripts/legacy-daily-log-import.ts --input "/path/to.xlsx"
 *   npx tsx scripts/legacy-daily-log-import.ts --include-unmatched  # 未匹配用户则创建停用销售账号
 *
 * 可重导：删除 structuredOutput.importSource === "legacy-daily-log" 的旧记录后再写入。
 */
import ExcelJS from "exceljs";
import path from "path";
import {
  Prisma,
  PrismaClient,
  SalesDailyLogStatus,
  type UserRole,
} from "@prisma/client";

const HOME = process.env.HOME || "/Users/wanjianan";
const DEFAULT_INPUT = path.join(HOME, "Downloads", "培安CRM-历史日报清洗待审.xlsx");
const IMPORT_SOURCE = "legacy-daily-log";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const INCLUDE_UNMATCHED = args.includes("--include-unmatched");
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const INPUT = argValue("--input") || DEFAULT_INPUT;

const prisma = new PrismaClient();

type SheetRow = Record<string, unknown>;

async function readSheet(name: string): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(INPUT);
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`缺少工作表: ${name}`);
  const headers: string[] = [];
  const rows: SheetRow[] = [];
  ws.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1);
    if (rowNumber === 1) {
      headers.push(...values.map((v) => String(v ?? "").trim()));
      return;
    }
    const obj: SheetRow = {};
    headers.forEach((h, i) => {
      obj[h] = values[i];
    });
    rows.push(obj);
  });
  return rows;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    const hh = String(v.getHours()).padStart(2, "0");
    const mm = String(v.getMinutes()).padStart(2, "0");
    const ss = String(v.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }
  return String(v).trim();
}

function parseLogDate(dayKey: string): Date {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`非法 logDate: ${dayKey}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function parseSubmittedAt(raw: string, fallbackDay: string): Date {
  const s = raw.trim();
  if (!s) return new Date(Number(fallbackDay.slice(0, 4)), Number(fallbackDay.slice(5, 7)) - 1, Number(fallbackDay.slice(8, 10)), 23, 59, 0);
  const normalized = s.replace(/-/g, "/");
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  return parseLogDate(fallbackDay);
}

async function ensureHistoricalUser(name: string): Promise<string> {
  const existing = await prisma.user.findFirst({ where: { name } });
  if (existing) {
    await prisma.personnelProfile.upsert({
      where: { userId: existing.id },
      create: {
        userId: existing.id,
        staffCategory: "SALES",
        enabled: false,
      },
      update: { enabled: false, staffCategory: "SALES" },
    });
    return existing.id;
  }
  const user = await prisma.user.create({
    data: {
      name,
      role: "SALES" as UserRole,
      phone: null,
      passwordHash: null,
      personnelProfile: {
        create: {
          staffCategory: "SALES",
          enabled: false,
        },
      },
    },
  });
  console.log("创建历史销售账号", name, user.id);
  return user.id;
}

function hasImportSource(value: Prisma.JsonValue | null | undefined): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>).importSource === IMPORT_SOURCE;
}

async function deletePreviousImportBatch(): Promise<number> {
  const candidates = await prisma.salesDailyLog.findMany({
    where: {
      OR: [
        { dailyReport: { contains: "历史往来摘录" } },
        { dailyReport: { contains: "<!-- import:legacy-daily-log -->" } },
      ],
    },
    select: { id: true, structuredOutput: true, dailyReport: true },
  });

  const ids: string[] = [];
  for (const row of candidates) {
    if (hasImportSource(row.structuredOutput)) {
      ids.push(row.id);
      continue;
    }
    // 兼容仅靠正文标记
    if (row.dailyReport?.includes("<!-- import:legacy-daily-log -->")) {
      ids.push(row.id);
    }
  }

  // 更稳妥：扫全部带 structuredOutput 的记录（量级可控）
  const withJson = await prisma.salesDailyLog.findMany({
    where: { structuredOutput: { not: Prisma.DbNull } },
    select: { id: true, structuredOutput: true },
  });
  for (const row of withJson) {
    if (hasImportSource(row.structuredOutput) && !ids.includes(row.id)) {
      ids.push(row.id);
    }
  }

  if (ids.length === 0) return 0;
  if (DRY_RUN) {
    console.log(`[dry-run] 将删除旧导入 ${ids.length} 条`);
    return ids.length;
  }
  const result = await prisma.salesDailyLog.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

async function main() {
  console.log("读取:", INPUT, DRY_RUN ? "(dry-run)" : "");
  const rows = await readSheet("可导入日报");
  console.log("待导入行:", rows.length);

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map(users.map((u) => [u.name.trim(), u.id]));

  const skippedUnmatched: string[] = [];
  const prepared: Array<{
    userId: string;
    reporter: string;
    logDate: Date;
    dailyReport: string;
    tomorrowPlan: string;
    submittedAt: Date;
    importBatch: string;
    sourceRows: string;
  }> = [];

  for (const row of rows) {
    const reporter = str(row["报告人"]);
    const logDateKey = str(row.logDate);
    const dailyReport = str(row.dailyReport);
    if (!reporter || !logDateKey || !dailyReport) continue;

    // 优先按姓名匹配（清洗表里的 userId 可能来自本地库，线上不可直接复用）
    let userId = byName.get(reporter) || "";
    if (!userId) {
      const excelUserId = str(row.userId);
      if (excelUserId) {
        const exists = await prisma.user.findUnique({
          where: { id: excelUserId },
          select: { id: true },
        });
        if (exists) userId = exists.id;
      }
    }
    if (!userId) {
      if (INCLUDE_UNMATCHED) {
        userId = DRY_RUN ? `dry-${reporter}` : await ensureHistoricalUser(reporter);
        byName.set(reporter, userId);
      } else {
        skippedUnmatched.push(`${reporter} ${logDateKey}`);
        continue;
      }
    }

    const reportWithMark = dailyReport.includes("<!-- import:legacy-daily-log -->")
      ? dailyReport
      : `${dailyReport}\n\n<!-- import:legacy-daily-log -->`;

    prepared.push({
      userId,
      reporter,
      logDate: parseLogDate(logDateKey),
      dailyReport: reportWithMark,
      tomorrowPlan: str(row.tomorrowPlan),
      submittedAt: parseSubmittedAt(str(row.submittedAt), logDateKey),
      importBatch: str(row.importBatch) || IMPORT_SOURCE,
      sourceRows: str(row.sourceRows),
    });
  }

  console.log("可写入:", prepared.length, "跳过未匹配:", skippedUnmatched.length);
  if (skippedUnmatched.length) {
    const names = [...new Set(skippedUnmatched.map((s) => s.split(" ")[0]))];
    console.log("未匹配报告人:", names.join("、"));
  }

  const deleted = await deletePreviousImportBatch();
  console.log("清理旧导入:", deleted);

  let upserted = 0;
  let conflicts = 0;

  for (const item of prepared) {
    if (DRY_RUN) {
      upserted += 1;
      continue;
    }

    const structuredOutput = {
      dailyReport: item.dailyReport,
      tomorrowPlan: item.tomorrowPlan || null,
      submittedAt: item.submittedAt.toISOString(),
      importSource: IMPORT_SOURCE,
      importBatch: item.importBatch,
      sourceRows: item.sourceRows,
    };

    const existing = await prisma.salesDailyLog.findUnique({
      where: {
        userId_logDate: { userId: item.userId, logDate: item.logDate },
      },
      select: { id: true, structuredOutput: true, status: true },
    });

    if (existing && !hasImportSource(existing.structuredOutput)) {
      // 已有人工/系统日报，不覆盖
      conflicts += 1;
      continue;
    }

    await prisma.salesDailyLog.upsert({
      where: {
        userId_logDate: { userId: item.userId, logDate: item.logDate },
      },
      create: {
        userId: item.userId,
        logDate: item.logDate,
        conversation: [],
        dailyReport: item.dailyReport,
        structuredOutput,
        status: SalesDailyLogStatus.SUBMITTED,
        riskFlag: false,
        riskNotes: null,
        submittedAt: item.submittedAt,
      },
      update: {
        conversation: [],
        dailyReport: item.dailyReport,
        structuredOutput,
        status: SalesDailyLogStatus.SUBMITTED,
        riskFlag: false,
        riskNotes: null,
        submittedAt: item.submittedAt,
      },
    });
    upserted += 1;
  }

  console.log(
    DRY_RUN
      ? `[dry-run] 将写入 ${upserted}，跳过已有非导入日报 ${conflicts}`
      : `已写入 ${upserted}，跳过已有非导入日报 ${conflicts}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
