/**
 * 从「人员工作时间及属地分布表」一键导入：按属地建项目 + 人员排班分段。
 *
 * 用法：
 *   npx tsx scripts/import-staff-site-distribution.ts
 *   npx tsx scripts/import-staff-site-distribution.ts --force   # 先删上次同标签导入
 *
 * 默认读取：tmp/imports/人员工作时间及属地分布表.xlsx
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { PrismaClient, type ProjectStatus } from "@prisma/client";
import { toDateOnly } from "../src/lib/projects/workdays";

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_XLSX = path.join(ROOT, "tmp/imports/人员工作时间及属地分布表.xlsx");
const IMPORT_TAG = "【导入】人员工作时间及属地分布表";
/** 「至今」= 导入当日（不预支未来月份） */
function openEndedEndDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const SITE_TO_CUSTOMER: Record<string, string> = {
  潮州三院: "潮州市第三人民医院",
  化州: "化州市人民医院",
  安医大二附院: "安徽医科大学第二附属医院",
  淮安三院: "淮安市第三人民医院",
  泗洪县第一人民医院: "泗洪县第一人民医院",
  滨海县人民医院: "滨海县人民医院",
};

const PERSON_ALIASES: Record<string, string> = {
  周友武: "周有武",
};

const p = new PrismaClient();

type Period = {
  start: Date;
  end: Date;
  openEnded: boolean;
  sites: string[];
};

type PersonRow = {
  excelName: string;
  periods: Period[];
};

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const obj = value as { result?: unknown; text?: string; richText?: { text: string }[] };
    if (obj.result != null) return cellText(obj.result);
    if (typeof obj.text === "string") return obj.text;
    if (Array.isArray(obj.richText)) return obj.richText.map((t) => t.text).join("");
  }
  return String(value).trim();
}

function parseDateCell(value: unknown): Date | null {
  const text = cellText(value).trim();
  if (!text || text === "至今") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel 日期多为 UTC 午夜，按 UTC 年月日落到本地 date-only
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const datePart = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [y, m, d] = datePart.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return null;
}

function parseSites(raw: string): string[] {
  return raw
    .split(/[、,，]/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePeriod(
  startVal: unknown,
  endVal: unknown,
  siteVal: unknown
): Period | null {
  const sites = parseSites(cellText(siteVal));
  if (sites.length === 0) return null;
  const start = parseDateCell(startVal);
  if (!start) return null;
  const endText = cellText(endVal).trim();
  const openEnded = endText === "至今";
  const end = openEnded ? openEndedEndDate() : parseDateCell(endVal);
  if (!end) return null;
  return { start, end, openEnded, sites };
}

async function readExcel(filePath: string): Promise<PersonRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel 无工作表");

  const rows: PersonRow[] = [];
  for (let r = 2; r <= (ws.rowCount || 0); r++) {
    const row = ws.getRow(r);
    const excelName = cellText(row.getCell(1).value).trim();
    if (!excelName) continue;
    const periods: Period[] = [];
    const p1 = parsePeriod(row.getCell(2).value, row.getCell(3).value, row.getCell(4).value);
    const p2 = parsePeriod(row.getCell(5).value, row.getCell(6).value, row.getCell(7).value);
    if (p1) periods.push(p1);
    if (p2) periods.push(p2);
    if (periods.length === 0) continue;
    rows.push({ excelName, periods });
  }
  return rows;
}

async function ensureImplementationProfile(userId: string) {
  const existing = await p.personnelProfile.findUnique({ where: { userId } });
  if (existing) {
    if (existing.staffCategory !== "IMPLEMENTATION" || !existing.enabled) {
      await p.personnelProfile.update({
        where: { userId },
        data: {
          staffCategory: "IMPLEMENTATION",
          personnelType: existing.personnelType ?? "IMPLEMENTER",
          enabled: true,
        },
      });
    }
    return;
  }
  await p.personnelProfile.create({
    data: {
      userId,
      staffCategory: "IMPLEMENTATION",
      personnelType: "IMPLEMENTER",
      enabled: true,
      dailyRate: 0,
    },
  });
}

/** 花名册缺席时自动建实施人员账号（企微 ID 占位，待补手机号/密码激活） */
async function resolveUser(excelName: string) {
  const name = PERSON_ALIASES[excelName] ?? excelName;
  let user = await p.user.findFirst({
    where: { name },
    include: { personnelProfile: true },
  });
  if (user) {
    await ensureImplementationProfile(user.id);
    user = await p.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { personnelProfile: true },
    });
    return { user, matchedName: name, created: false };
  }

  const wecomUserId = `import-${name}-${Date.now().toString(36)}`;
  user = await p.user.create({
    data: {
      name,
      role: "PROJECT_STAFF",
      wecomUserId,
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
    include: { personnelProfile: true },
  });
  return { user, matchedName: name, created: true };
}

function dailyRateOf(user: {
  personnelProfile: { dailyRate: { toString(): string } | null } | null;
}): number {
  const rate = user.personnelProfile?.dailyRate;
  return rate != null ? Number(rate) : 0;
}

async function main() {
  const force = process.argv.includes("--force");
  const fileArg = process.argv.find((a) => a.endsWith(".xlsx"));
  const filePath = fileArg ? path.resolve(fileArg) : DEFAULT_XLSX;
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到文件：${filePath}`);
  }

  if (force) {
    const old = await p.project.findMany({
      where: { notes: { contains: IMPORT_TAG } },
      select: { id: true, name: true },
    });
    if (old.length) {
      await p.project.deleteMany({ where: { id: { in: old.map((x) => x.id) } } });
      console.log(`已删除上次导入项目 ${old.length} 个:`, old.map((x) => x.name).join("、"));
    }
  }

  const personRows = await readExcel(filePath);
  console.log(`读取 ${personRows.length} 人`);

  // 收集属地 → 分配
  type AllocDraft = {
    site: string;
    userId: string;
    personName: string;
    start: Date;
    end: Date;
    openEnded: boolean;
    notes: string;
  };
  const drafts: AllocDraft[] = [];
  const createdUsers: string[] = [];
  const aliasHits: string[] = [];

  for (const row of personRows) {
    const { user, matchedName, created } = await resolveUser(row.excelName);
    if (created) createdUsers.push(matchedName);
    if (PERSON_ALIASES[row.excelName]) {
      aliasHits.push(`${row.excelName}→${matchedName}`);
    }

    for (const period of row.periods) {
      for (const site of period.sites) {
        if (!SITE_TO_CUSTOMER[site]) {
          console.warn(`未知属地，跳过：${site}（${row.excelName}）`);
          continue;
        }
        drafts.push({
          site,
          userId: user.id,
          personName: matchedName,
          start: period.start,
          end: period.end,
          openEnded: period.openEnded,
          notes: [
            IMPORT_TAG,
            period.openEnded ? "结束：至今（记至导入当日）" : null,
            period.sites.length > 1
              ? `表内同期属地：${period.sites.join("、")}`
              : null,
            row.excelName !== matchedName ? `表内姓名：${row.excelName}` : null,
          ]
            .filter(Boolean)
            .join("；"),
        });
      }
    }
  }

  // 同一人同一项目若相邻段同日交接，把上一段结束日提前一天
  const byUserSite = new Map<string, AllocDraft[]>();
  for (const d of drafts) {
    const key = `${d.userId}\0${d.site}`;
    const list = byUserSite.get(key) ?? [];
    list.push(d);
    byUserSite.set(key, list);
  }
  for (const list of byUserSite.values()) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      const next = list[i + 1];
      if (cur.end.getTime() >= next.start.getTime()) {
        const adjusted = new Date(next.start);
        adjusted.setDate(adjusted.getDate() - 1);
        if (adjusted.getTime() < cur.start.getTime()) {
          // 退化：压成单日
          cur.end = new Date(cur.start);
        } else {
          cur.end = toDateOnly(adjusted);
        }
      }
    }
  }

  const sites = [...new Set(drafts.map((d) => d.site))];
  console.log(`属地/项目 ${sites.length} 个:`, sites.join("、"));

  const projectBySite = new Map<string, string>();

  for (const site of sites) {
    const customerName = SITE_TO_CUSTOMER[site];
    const customer = await p.customer.findFirst({
      where: { name: customerName },
      select: { id: true, name: true },
    });
    if (!customer) {
      console.warn(`客户不存在，项目将不关联客户：${customerName}`);
    }

    const siteDrafts = drafts.filter((d) => d.site === site);
    const minStart = siteDrafts.reduce(
      (m, d) => (d.start < m ? d.start : m),
      siteDrafts[0].start
    );
    const maxEnd = siteDrafts.reduce(
      (m, d) => (d.end > m ? d.end : m),
      siteDrafts[0].end
    );
    const status: ProjectStatus = "IMPLEMENTING";

    const project = await p.project.create({
      data: {
        name: customer?.name ?? customerName,
        customerId: customer?.id ?? null,
        status,
        plannedStartAt: minStart,
        plannedEndAt: maxEnd,
        actualStartAt: minStart,
        actualEndAt: null,
        notes: `${IMPORT_TAG}；属地简称：${site}`,
      },
    });
    projectBySite.set(site, project.id);
    console.log(`✓ 项目 ${project.name} (${status}) id=${project.id}`);
  }

  let allocCount = 0;
  const memberKeys = new Set<string>();

  for (const d of drafts) {
    const projectId = projectBySite.get(d.site);
    if (!projectId) continue;

    const user = await p.user.findUnique({
      where: { id: d.userId },
      include: { personnelProfile: true },
    });
    if (!user) continue;

    await p.projectStaffAllocation.create({
      data: {
        projectId,
        userId: d.userId,
        startDate: d.start,
        endDate: d.end,
        allocationMode: "AUTO",
        dailyRateSnapshot: dailyRateOf(user),
        notes: d.notes,
      },
    });
    allocCount += 1;

    const mk = `${projectId}\0${d.userId}`;
    if (!memberKeys.has(mk)) {
      memberKeys.add(mk);
      const personnelType = user.personnelProfile?.personnelType ?? "IMPLEMENTER";
      await p.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: d.userId } },
        create: {
          projectId,
          userId: d.userId,
          memberRole: personnelType,
          isProjectManager: false,
        },
        update: {},
      });
    }
  }

  console.log("\n—— 导入完成 ——");
  console.log(`项目：${sites.length}`);
  console.log(`排班分段：${allocCount}`);
  console.log(`项目成员：${memberKeys.size}`);
  if (aliasHits.length) console.log(`姓名别名：${aliasHits.join("；")}`);
  if (createdUsers.length) {
    console.log(
      `自动新建实施人员账号（花名册缺席，日单价 0，待补手机号/密码）：${createdUsers.join("、")}`
    );
  }
  console.log("请在本地打开 /projects 与 /projects/schedule 查看效果。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
