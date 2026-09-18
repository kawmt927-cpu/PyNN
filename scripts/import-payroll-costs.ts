/**
 * 方案 A：从税后工资表导入人员月成本（北京/上海合并，不区分主体）
 *
 * 映射：
 *   contributionBase     ← 缴费基数
 *   baseSalary           ← 基本工资
 *   adjustmentAmount     ← 奖金 + 绩效工资 + 加减工资
 *   leaveDeductionAmount ← 病假扣除 + 事假扣除
 *   socialSecurityCompany← 社保公司承担
 *   housingFundCompany   ← 扣公积金（表无公司列，对等近似）
 *
 * 用法：
 *   npx tsx scripts/import-payroll-costs.ts --dry-run
 *   npx tsx scripts/import-payroll-costs.ts --apply
 *   npx tsx scripts/import-payroll-costs.ts --apply --files tmp/imports/payroll/2025.xlsx,tmp/imports/payroll/2026.xlsx
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import {
  computeMonthlyCost,
  countMonthWorkdays,
  resolveDailyRateForMonth,
  resolveEffectiveMonthlyCost,
  shiftYearMonth,
} from "../src/lib/personnel/daily-rate";

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_FILES = [
  path.join(ROOT, "tmp/imports/payroll/2025.xlsx"),
  path.join(ROOT, "tmp/imports/payroll/2026.xlsx"),
];

const PERSON_ALIASES: Record<string, string> = {
  周友武: "周有武",
  藏天民: "臧天民",
};

const IMPORT_NOTE_PREFIX = "【工资表导入】";

const p = new PrismaClient();

type ParsedRow = {
  year: number;
  month: number;
  sheetName: string;
  entity: "北京" | "上海" | "未拆分";
  name: string;
  contributionBase: number | null;
  baseSalary: number | null;
  bonus: number;
  performance: number;
  wageAdjust: number;
  sickLeaveDays: number | null;
  sickDeduction: number;
  personalLeaveDays: number | null;
  personalLeaveDeduction: number;
  payable: number | null;
  socialSecurityCompany: number | null;
  housingFundPersonal: number | null;
  pensionPersonal: number | null;
  medicalPersonal: number | null;
  unemploymentPersonal: number | null;
  socialSecurityPersonal: number | null;
  tax: number | null;
  netPay: number | null;
  seniorityYears: number | null;
};

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const o = value as { result?: unknown; text?: string; richText?: { text: string }[] };
    if (o.result != null) return cellText(o.result);
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
  }
  return String(value).trim();
}

function cellNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value && "result" in value) {
    return cellNum((value as { result: unknown }).result);
  }
  const t = cellText(value).replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function money(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function parseSheetYearMonth(sheetName: string): { year: number; month: number } | null {
  const m = sheetName.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (!m) return null;
  const payYear = Number(m[1]);
  const payMonth = Number(m[2]);
  // 表名是发薪/缴纳月；CRM 存归属月（上一月）。例：8 月工资表 → 7 月成本
  return shiftYearMonth(payYear, payMonth, -1);
}

function detectEntity(sheetName: string): ParsedRow["entity"] {
  if (sheetName.includes("北京")) return "北京";
  if (sheetName.includes("上海")) return "上海";
  return "未拆分";
}

type ColMap = {
  name: number;
  contributionBase: number | null;
  socialSecurityCompany: number | null;
  baseSalary: number | null;
  bonus: number | null;
  performance: number | null;
  wageAdjust: number | null;
  payable: number | null;
  housingFundPersonal: number | null;
  tax: number | null;
  netPay: number | null;
  sickLeaveDays: number | null;
  sickDeduction: number | null;
  personalLeaveDays: number | null;
  personalLeaveDeduction: number | null;
  pensionPersonal: number | null;
  medicalPersonal: number | null;
  unemploymentPersonal: number | null;
  socialSecurityPersonal: number | null;
  seniorityYears: number | null;
};

function buildColMap(headerCells: string[]): ColMap | null {
  const norm = headerCells.map((h) => h.replace(/\s+/g, "").replace(/\n/g, ""));
  const find = (...keys: string[]) => {
    const i = norm.findIndex((h) => keys.some((k) => h.includes(k)));
    return i >= 0 ? i + 1 : null;
  };
  const name = find("姓名");
  if (!name) return null;

  let sickDeduction: number | null = null;
  let personalLeaveDeduction: number | null = null;
  let sickLeaveDays: number | null = null;
  let personalLeaveDays: number | null = null;
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    const prev = i > 0 ? norm[i - 1] : "";
    if (h.includes("病假天数")) sickLeaveDays = i + 1;
    if (h.includes("事假天数")) personalLeaveDays = i + 1;
    if (h.includes("扣除金额") || h === "扣除金额") {
      if (prev.includes("病假")) sickDeduction = i + 1;
      else if (prev.includes("事假")) personalLeaveDeduction = i + 1;
    }
  }

  return {
    name,
    contributionBase: find("缴费基数"),
    socialSecurityCompany: find("社保公司"),
    baseSalary: find("基本工资"),
    bonus: find("奖金"),
    performance: find("绩效"),
    wageAdjust: find("加减工资"),
    payable: find("应付工资"),
    housingFundPersonal: find("扣公积金"),
    tax: find("个税"),
    netPay: find("税后"),
    sickLeaveDays,
    sickDeduction,
    personalLeaveDays,
    personalLeaveDeduction,
    pensionPersonal: find("养老"),
    medicalPersonal: find("医疗"),
    unemploymentPersonal: find("失业"),
    socialSecurityPersonal: find("扣社保"),
    seniorityYears: find("司龄"),
  };
}

function findHeaderRow(ws: ExcelJS.Worksheet): { row: number; map: ColMap } | null {
  const maxR = Math.min(10, ws.rowCount || 10);
  const maxC = Math.min(40, ws.columnCount || 40);
  for (let r = 1; r <= maxR; r++) {
    const headers: string[] = [];
    for (let c = 1; c <= maxC; c++) {
      headers.push(cellText(ws.getRow(r).getCell(c).value));
    }
    if (!headers.some((h) => h.includes("姓名"))) continue;
    const map = buildColMap(headers);
    if (map) return { row: r, map };
  }
  return null;
}

async function parseFile(filePath: string): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const rows: ParsedRow[] = [];

  for (const ws of wb.worksheets) {
    const ym = parseSheetYearMonth(ws.name);
    if (!ym) {
      console.warn(`跳过无法解析年月的表：${ws.name}`);
      continue;
    }
    const header = findHeaderRow(ws);
    if (!header) {
      console.warn(`跳过无表头：${ws.name}`);
      continue;
    }
    const { map } = header;
    const entity = detectEntity(ws.name);
    const maxC = Math.min(40, ws.columnCount || 40);

    for (let r = header.row + 1; r <= (ws.rowCount || 0); r++) {
      const excelRow = ws.getRow(r);
      const nameRaw = cellText(excelRow.getCell(map.name).value).trim();
      if (!nameRaw || /合计|小计|总计/.test(nameRaw)) continue;
      if (nameRaw.length > 12) continue;

      const get = (col: number | null) =>
        col == null ? null : cellNum(excelRow.getCell(col).value);

      // 整行几乎空则跳过
      let anyMoney = false;
      for (let c = 1; c <= maxC; c++) {
        if (cellNum(excelRow.getCell(c).value) != null) {
          anyMoney = true;
          break;
        }
      }
      if (!anyMoney && !get(map.baseSalary) && !get(map.payable)) continue;

      rows.push({
        year: ym.year,
        month: ym.month,
        sheetName: ws.name.trim(),
        entity,
        name: PERSON_ALIASES[nameRaw] ?? nameRaw,
        contributionBase: get(map.contributionBase),
        baseSalary: get(map.baseSalary),
        bonus: money(get(map.bonus)),
        performance: money(get(map.performance)),
        wageAdjust: money(get(map.wageAdjust)),
        sickLeaveDays: get(map.sickLeaveDays),
        sickDeduction: money(get(map.sickDeduction)),
        personalLeaveDays: get(map.personalLeaveDays),
        personalLeaveDeduction: money(get(map.personalLeaveDeduction)),
        payable: get(map.payable),
        socialSecurityCompany: get(map.socialSecurityCompany),
        housingFundPersonal: get(map.housingFundPersonal),
        pensionPersonal: get(map.pensionPersonal),
        medicalPersonal: get(map.medicalPersonal),
        unemploymentPersonal: get(map.unemploymentPersonal),
        socialSecurityPersonal: get(map.socialSecurityPersonal),
        tax: get(map.tax),
        netPay: get(map.netPay),
        seniorityYears: get(map.seniorityYears),
      });
    }
  }
  return rows;
}

/** 同月同名合并（北上不应重叠；若重叠则金额相加并告警） */
function mergeByPersonMonth(rows: ParsedRow[]): ParsedRow[] {
  const map = new Map<string, ParsedRow>();
  for (const row of rows) {
    const key = `${row.year}-${row.month}-${row.name}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
      continue;
    }
    console.warn(
      `⚠ 同月重名合并：${row.name} ${row.year}-${row.month}（${existing.entity}+${row.entity}）`
    );
    const sumNullable = (a: number | null, b: number | null) => {
      if (a == null && b == null) return null;
      return money((a ?? 0) + (b ?? 0));
    };
    map.set(key, {
      ...existing,
      entity: "未拆分",
      sheetName: `${existing.sheetName}+${row.sheetName}`,
      contributionBase: row.contributionBase ?? existing.contributionBase,
      baseSalary: sumNullable(existing.baseSalary, row.baseSalary),
      bonus: money(existing.bonus + row.bonus),
      performance: money(existing.performance + row.performance),
      wageAdjust: money(existing.wageAdjust + row.wageAdjust),
      sickLeaveDays: sumNullable(existing.sickLeaveDays, row.sickLeaveDays),
      sickDeduction: money(existing.sickDeduction + row.sickDeduction),
      personalLeaveDays: sumNullable(existing.personalLeaveDays, row.personalLeaveDays),
      personalLeaveDeduction: money(
        existing.personalLeaveDeduction + row.personalLeaveDeduction
      ),
      payable: sumNullable(existing.payable, row.payable),
      socialSecurityCompany: sumNullable(
        existing.socialSecurityCompany,
        row.socialSecurityCompany
      ),
      housingFundPersonal: sumNullable(
        existing.housingFundPersonal,
        row.housingFundPersonal
      ),
      pensionPersonal: sumNullable(existing.pensionPersonal, row.pensionPersonal),
      medicalPersonal: sumNullable(existing.medicalPersonal, row.medicalPersonal),
      unemploymentPersonal: sumNullable(
        existing.unemploymentPersonal,
        row.unemploymentPersonal
      ),
      socialSecurityPersonal: sumNullable(
        existing.socialSecurityPersonal,
        row.socialSecurityPersonal
      ),
      tax: sumNullable(existing.tax, row.tax),
      netPay: sumNullable(existing.netPay, row.netPay),
      seniorityYears: row.seniorityYears ?? existing.seniorityYears,
    });
  }
  return [...map.values()];
}

function toCostFields(row: ParsedRow) {
  const adjustmentAmount = money(row.bonus + row.performance + row.wageAdjust);
  const leaveDeductionAmount = money(row.sickDeduction + row.personalLeaveDeduction);
  const housingFundCompany =
    row.housingFundPersonal != null ? money(row.housingFundPersonal) : null;

  let payableCheck: string | null = null;
  if (row.payable != null && row.baseSalary != null) {
    const expected = money(
      (row.baseSalary ?? 0) + adjustmentAmount - leaveDeductionAmount
    );
    const diff = Math.abs(expected - row.payable);
    if (diff > 1) {
      payableCheck = `应付轧差 ${diff.toFixed(2)}（分项=${expected} 表=${row.payable}）`;
    }
  }

  const notes = [
    IMPORT_NOTE_PREFIX,
    row.entity !== "未拆分" ? `发放：${row.entity}` : null,
    `来源：${row.sheetName}`,
    housingFundCompany != null ? "公积金公司≈扣公积金" : null,
    payableCheck,
  ]
    .filter(Boolean)
    .join("；");

  return {
    contributionBase: row.contributionBase,
    baseSalary: row.baseSalary,
    socialSecurityCompany: row.socialSecurityCompany,
    housingFundCompany,
    adjustmentAmount,
    leaveDeductionAmount,
    notes,
    // 完整工资条
    payrollEntity: row.entity === "未拆分" ? null : row.entity,
    seniorityYears: row.seniorityYears,
    bonus: row.bonus || null,
    performancePay: row.performance || null,
    wageAdjust: row.wageAdjust || null,
    sickLeaveDays: row.sickLeaveDays,
    sickLeaveDeduction: row.sickDeduction || null,
    personalLeaveDays: row.personalLeaveDays,
    personalLeaveDeduction: row.personalLeaveDeduction || null,
    payableWage: row.payable,
    pensionPersonal: row.pensionPersonal,
    medicalPersonal: row.medicalPersonal,
    unemploymentPersonal: row.unemploymentPersonal,
    socialSecurityPersonal: row.socialSecurityPersonal,
    housingFundPersonal: row.housingFundPersonal,
    incomeTax: row.tax,
    netPay: row.netPay,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
  const filesArg = process.argv.find((a) => a.startsWith("--files="));
  const files = filesArg
    ? filesArg
        .slice("--files=".length)
        .split(",")
        .map((f) => path.resolve(ROOT, f.trim()))
    : DEFAULT_FILES;

  for (const f of files) {
    if (!fs.existsSync(f)) throw new Error(`文件不存在：${f}`);
  }

  console.log(dryRun ? "=== DRY-RUN（不加 --apply 不写库）===" : "=== APPLY 写入数据库 ===");
  console.log("文件：", files.map((f) => path.basename(f)).join(", "));

  let all: ParsedRow[] = [];
  for (const f of files) {
    const parsed = await parseFile(f);
    console.log(`读入 ${path.basename(f)}：${parsed.length} 行`);
    all = all.concat(parsed);
  }
  const merged = mergeByPersonMonth(all);
  console.log(`合并后：${merged.length} 人·月`);

  const users = await p.user.findMany({
    select: {
      id: true,
      name: true,
      role: true,
      personnelProfile: { select: { staffCategory: true, enabled: true } },
    },
  });
  const byName = new Map(users.map((u) => [u.name, u]));

  const unmatched = new Set<string>();
  const matched: Array<{
    userId: string;
    name: string;
    year: number;
    month: number;
    fields: ReturnType<typeof toCostFields>;
    staffCategory: string | null;
  }> = [];

  for (const row of merged) {
    let user = byName.get(row.name);
    if (!user) {
      unmatched.add(row.name);
      if (dryRun) {
        // dry-run：仅预览，不建账号
        matched.push({
          userId: "__pending__",
          name: row.name,
          year: row.year,
          month: row.month,
          fields: toCostFields(row),
          staffCategory: "IMPLEMENTATION",
        });
        continue;
      }
      // --apply：花名册缺席则建账号 + 实施档案，再写入月成本
      const created = await p.user.create({
        data: {
          name: row.name,
          role: "PROJECT_STAFF",
          wecomUserId: `payroll-import-${row.name}-${Date.now().toString(36)}`,
          includeInTeamPerformance: false,
          includeInMonthlyAssessment: false,
          personnelProfile: {
            create: {
              staffCategory: "IMPLEMENTATION",
              personnelType: "IMPLEMENTER",
              enabled: true,
              dailyRate: 0,
            },
          },
        },
        select: {
          id: true,
          name: true,
          role: true,
          personnelProfile: { select: { staffCategory: true, enabled: true } },
        },
      });
      user = created;
      byName.set(row.name, created);
      console.log(`自动建账号：${row.name}`);
    }
    matched.push({
      userId: user.id,
      name: row.name,
      year: row.year,
      month: row.month,
      fields: toCostFields(row),
      staffCategory: user.personnelProfile?.staffCategory ?? null,
    });
  }

  // 样本打印
  const samples = matched.filter((m) =>
    ["纪超", "徐鸽", "刘武全", "侯海峰", "钱金明"].includes(m.name)
  );
  console.log("\n—— 样本映射 ——");
  for (const s of samples.slice(0, 12)) {
    const f = s.fields;
    const fixed = computeMonthlyCost(f);
    const effective = resolveEffectiveMonthlyCost(
      fixed,
      f.adjustmentAmount,
      f.leaveDeductionAmount
    );
    console.log(
      `${s.name} ${s.year}-${String(s.month).padStart(2, "0")} [${s.staffCategory}] ` +
        `基本=${f.baseSalary} 调整=${f.adjustmentAmount} 假扣=${f.leaveDeductionAmount} ` +
        `社保公司=${f.socialSecurityCompany} 公积金≈${f.housingFundCompany} ` +
        `→固定=${fixed} 有效=${effective}`
    );
    if (f.notes.includes("轧差")) console.log(`  notes: ${f.notes}`);
  }

  console.log(
    "\n本次自动新建账号：",
    unmatched.size ? [...unmatched].sort().join("、") : "无"
  );
  console.log(
    "匹配/写入人·月：",
    matched.length,
    "其中实施：",
    matched.filter((m) => m.staffCategory === "IMPLEMENTATION").length
  );

  if (dryRun) {
    console.log("\nDry-run 结束。确认无误后执行：npx tsx scripts/import-payroll-costs.ts --apply");
    console.log("（dry-run 不会真正建账号；--apply 时才会创建未匹配人员）");
    return;
  }

  const now = new Date();
  let written = 0;

  for (const row of matched) {
    let profile = await p.personnelProfile.findUnique({ where: { userId: row.userId } });
    if (!profile) {
      // 有账号无档案：补实施档案以便成本可算（销售等也可有月成本台账）
      profile = await p.personnelProfile.create({
        data: {
          userId: row.userId,
          staffCategory: "IMPLEMENTATION",
          personnelType: "IMPLEMENTER",
          enabled: true,
        },
      });
      console.log(`补建档案：${row.name}`);
    }

    const attendanceDays = countMonthWorkdays(new Date(row.year, row.month - 1, 1));
    const f = row.fields;

    await p.personnelMonthlyCostAdjustment.upsert({
      where: {
        userId_year_month: { userId: row.userId, year: row.year, month: row.month },
      },
      create: {
        userId: row.userId,
        year: row.year,
        month: row.month,
        contributionBase: f.contributionBase,
        baseSalary: f.baseSalary,
        socialSecurityCompany: f.socialSecurityCompany,
        housingFundCompany: f.housingFundCompany,
        adjustmentAmount: f.adjustmentAmount,
        leaveDeductionAmount: f.leaveDeductionAmount,
        attendanceDays,
        notes: null,
        confirmedAt: now,
        payrollEntity: f.payrollEntity,
        seniorityYears: f.seniorityYears,
        bonus: f.bonus,
        performancePay: f.performancePay,
        wageAdjust: f.wageAdjust,
        sickLeaveDays: f.sickLeaveDays,
        sickLeaveDeduction: f.sickLeaveDeduction,
        personalLeaveDays: f.personalLeaveDays,
        personalLeaveDeduction: f.personalLeaveDeduction,
        payableWage: f.payableWage,
        pensionPersonal: f.pensionPersonal,
        medicalPersonal: f.medicalPersonal,
        unemploymentPersonal: f.unemploymentPersonal,
        socialSecurityPersonal: f.socialSecurityPersonal,
        housingFundPersonal: f.housingFundPersonal,
        incomeTax: f.incomeTax,
        netPay: f.netPay,
      },
      update: {
        contributionBase: f.contributionBase,
        baseSalary: f.baseSalary,
        socialSecurityCompany: f.socialSecurityCompany,
        housingFundCompany: f.housingFundCompany,
        adjustmentAmount: f.adjustmentAmount,
        leaveDeductionAmount: f.leaveDeductionAmount,
        attendanceDays,
        notes: null,
        confirmedAt: now,
        payrollEntity: f.payrollEntity,
        seniorityYears: f.seniorityYears,
        bonus: f.bonus,
        performancePay: f.performancePay,
        wageAdjust: f.wageAdjust,
        sickLeaveDays: f.sickLeaveDays,
        sickLeaveDeduction: f.sickLeaveDeduction,
        personalLeaveDays: f.personalLeaveDays,
        personalLeaveDeduction: f.personalLeaveDeduction,
        payableWage: f.payableWage,
        pensionPersonal: f.pensionPersonal,
        medicalPersonal: f.medicalPersonal,
        unemploymentPersonal: f.unemploymentPersonal,
        socialSecurityPersonal: f.socialSecurityPersonal,
        housingFundPersonal: f.housingFundPersonal,
        incomeTax: f.incomeTax,
        netPay: f.netPay,
      },
    });

    // 刷新档案成本缓存为「最近导入月」——仅当该月 ≥ 档案当前关联逻辑：写最新月
    const fixed = computeMonthlyCost(f);
    const effective = resolveEffectiveMonthlyCost(
      fixed,
      f.adjustmentAmount,
      f.leaveDeductionAmount
    );
    const dailyRate = resolveDailyRateForMonth(
      effective,
      row.year,
      row.month,
      attendanceDays
    );

    // 只在导入的最新月份更新 dailyRate 缓存
    written += 1;
    // 暂存，后面按人取最新月刷新
    (row as { _dailyRate?: number | null })._dailyRate = dailyRate;
  }

  // 按人取最大年月刷新 dailyRate
  const latestByUser = new Map<string, (typeof matched)[0]>();
  for (const row of matched) {
    const prev = latestByUser.get(row.userId);
    if (
      !prev ||
      row.year > prev.year ||
      (row.year === prev.year && row.month > prev.month)
    ) {
      latestByUser.set(row.userId, row);
    }
  }
  for (const row of latestByUser.values()) {
    const f = row.fields;
    const attendanceDays = countMonthWorkdays(new Date(row.year, row.month - 1, 1));
    const fixed = computeMonthlyCost(f);
    const effective = resolveEffectiveMonthlyCost(
      fixed,
      f.adjustmentAmount,
      f.leaveDeductionAmount
    );
    const dailyRate = resolveDailyRateForMonth(
      effective,
      row.year,
      row.month,
      attendanceDays
    );
    await p.personnelProfile.update({
      where: { userId: row.userId },
      data: {
        contributionBase: f.contributionBase,
        baseSalary: f.baseSalary,
        socialSecurityCompany: f.socialSecurityCompany,
        housingFundCompany: f.housingFundCompany,
        dailyRate,
      },
    });
  }

  console.log(`\n✓ 已写入 ${written} 条人·月成本（已确认）`);
  console.log(`刷新档案日单价：${latestByUser.size} 人`);
  if (unmatched.size) {
    console.log(`本批新建账号：${[...unmatched].sort().join("、")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
