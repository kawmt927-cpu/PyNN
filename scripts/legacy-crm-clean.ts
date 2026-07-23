/**
 * 旧 CRM Excel 清洗 → 生成待审工作簿（不入库）。
 *
 * 用法：
 *   npx tsx scripts/legacy-crm-clean.ts
 *   npx tsx scripts/legacy-crm-clean.ts --skip-kimi   # 仅规则清洗
 *   npx tsx scripts/legacy-crm-clean.ts --limit 20    # 调试只处理前 N 个客户 Kimi
 *
 * 输出：~/Downloads/培安CRM-旧数据清洗待审.xlsx
 * 缓存：tmp/legacy-import/kimi-cache.json（可断点续跑）
 */
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { enrichCustomerWithKimi } from "../src/lib/customers/kimi-enrich";
import { callKimiJson } from "../src/lib/customers/kimi-client";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(__dirname, "..");
const CUSTOMER_XLSX = "/Users/wanjianan/Downloads/客户列表.xlsx";
const VISIT_XLSX = "/Users/wanjianan/Downloads/往来列表.xlsx";
const OUT_XLSX = path.join(
  process.env.HOME || "/Users/wanjianan",
  "Downloads",
  "培安CRM-旧数据清洗待审.xlsx"
);
const CACHE_DIR = path.join(ROOT, "tmp/legacy-import");
const KIMI_CACHE = path.join(CACHE_DIR, "kimi-cache.json");
const VISIT_AI_CACHE = path.join(CACHE_DIR, "visit-ai-cache.json");

const ACTIVE_SALES = new Set(["钱金明", "蔡晗蕾", "沈伟", "万嘉南", "张潇笑"]);
const BATCH_ID = `legacy-crm-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

const args = process.argv.slice(2);
const SKIP_KIMI = args.includes("--skip-kimi");
const limitIdx = args.indexOf("--limit");
const KIMI_LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const CONCURRENCY = 3;

type Row = Record<string, unknown>;

type CleanCustomer = {
  legacyKey: string;
  rawNames: string[];
  name: string;
  category: "HOSPITAL" | "COMPANY" | "INDIVIDUAL";
  /** 写入系统的 value */
  customerType: string;
  customerTypeLabel: string;
  customerGrade: "NONE";
  /** 写入系统的 value；无匹配则为空 */
  source: string | null;
  sourceLabel: string | null;
  sourceRaw: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  hospitalLevel: string | null;
  bedCount: number | null;
  tags: string;
  notes: string;
  ownerMode: "ACTIVE" | "POOL";
  ownerName: string | null;
  legacyOwnerName: string | null;
  assistants: string;
  createdAt: string | null;
  kimiStatus: string;
  reviewFlags: string;
};

type CleanContact = {
  customerLegacyKey: string;
  customerName: string;
  name: string;
  title: string | null;
  department: string | null;
  phone: string | null;
  wechat: string | null;
  gender: string | null;
  roleRaw: string | null;
  roleMapped: string;
  rawContact: string;
  confidence: "high" | "medium" | "low";
  reviewFlags: string;
};

type CleanVisit = {
  customerRawName: string;
  customerLegacyKey: string | null;
  customerName: string | null;
  contactRaw: string;
  method: string;
  methodMapped: string;
  salesName: string;
  salesIsHistorical: boolean;
  plannedContent: string | null;
  actualContent: string | null;
  content: string;
  contentSource: "actual" | "planned" | "same" | "ai" | "empty";
  followUpAt: string | null;
  statusRaw: string;
  importDecision: "IMPORT" | "SKIP";
  skipReason: string | null;
  reviewFlags: string;
};

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function blankToNull(s: string): string | null {
  const t = s.trim();
  if (!t || t === "-" || t === "—") return null;
  return t;
}

function normalizeHeader(h: string, seen: Map<string, number>): string {
  const base = h.trim() || "col";
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}_${n}`;
}

async function readSheet(filePath: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Row[] = [];
  let headers: string[] = [];
  const seen = new Map<string, number>();
  ws.eachRow((row, rowNumber) => {
    const values = row.values as unknown[];
    // exceljs is 1-indexed; values[0] unused
    const cells = values.slice(1).map((v) => (typeof v === "object" && v && "text" in (v as object) ? (v as { text: string }).text : v));
    if (rowNumber === 1) {
      headers = cells.map((c) => normalizeHeader(cellStr(c), seen));
      return;
    }
    const obj: Row = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i];
    });
    rows.push(obj);
  });
  return rows;
}

function loadJsonCache<T>(file: string): Record<string, T> {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, T>;
}

function saveJsonCache(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function looksLikeHospital(name: string, tags: string): boolean {
  const t = `${name} ${tags}`;
  return /(医院|卫生院|保健院|中医院|人民医院|妇幼|社区卫生|门诊部|诊所|康复院|护理院)/.test(t);
}

function looksLikePerson(name: string): boolean {
  const n = name.replace(/\s/g, "");
  if (n.length < 2 || n.length > 4) return false;
  if (/(公司|医院|诊所|中心|卫生|科技|有限|集团|药店|药房|器械)/.test(n)) return false;
  // 常见中文姓名 2-3 字；4 字少见但可能
  return /^[\u4e00-\u9fff]{2,4}$/.test(n);
}

type ConfigMaps = {
  typeByLabel: Map<string, string>;
  sourceByLabel: Map<string, string>;
};

function mapSource(raw: string | null, maps: ConfigMaps): { value: string | null; label: string | null } {
  if (!raw) return { value: null, label: null };
  // 旧→现用标签近似
  const alias: Record<string, string> = {
    主动开发: "自行开发",
    线索转化: "公司提供",
    公司分配: "公司提供",
  };
  const label = alias[raw] ?? raw;
  const value = maps.sourceByLabel.get(label) ?? maps.sourceByLabel.get(raw) ?? null;
  return { value, label: value ? label : raw };
}

function mapCustomerType(category: "HOSPITAL" | "COMPANY" | "INDIVIDUAL", maps: ConfigMaps) {
  const label = category === "HOSPITAL" ? "直接客户" : "渠道";
  const value =
    maps.typeByLabel.get(label) ??
    (category === "HOSPITAL" ? "DIRECT" : maps.typeByLabel.get("渠道") ?? "CHANNEL");
  return { value, label };
}

function mapMethod(raw: string): string {
  if (raw.includes("面访")) return "FACE_VISIT";
  if (raw.includes("微信")) return "WECHAT";
  if (raw.includes("电话")) return "PHONE";
  if (raw.includes("线上") || raw.includes("会议")) return "ONLINE_MEETING";
  return "OTHER";
}

function mapContactRole(raw: string | null): string {
  if (!raw) return "OTHER";
  if (raw.includes("决策")) return "DECISION_MAKER";
  if (raw.includes("负责") || raw.includes("执行") || raw.includes("影响")) return "TECHNICAL";
  return "OTHER";
}

function cleanPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits === "1" || digits.length < 7) return null;
  if (/^1\d{10}$/.test(digits)) return digits;
  return raw;
}

/** 拆分联系人：姓名 / 职务 / 部门 */
function splitContact(rawInput: string): {
  name: string;
  title: string | null;
  department: string | null;
  confidence: "high" | "medium" | "low";
  flags: string[];
} {
  const flags: string[] = [];
  let raw = rawInput.trim();
  if (!raw || raw === "-") {
    return { name: "未知联系人", title: null, department: null, confidence: "low", flags: ["空联系人"] };
  }

  // 纯部门
  if (/^(信息科|财务科|人事科|经管办|绩效|审计|医务|护理|院办)/.test(raw) && !/[\u4e00-\u9fff]{2,}(科长|主任|院长)/.test(raw) && raw.length <= 8 && !/-/.test(raw)) {
    if (!/(科长|主任|院长|老师)$/.test(raw) && !/^[\u4e00-\u9fff]{2,3}$/.test(raw)) {
      flags.push("疑似仅部门名");
      return { name: "未知联系人", title: null, department: raw, confidence: "low", flags };
    }
  }

  let department: string | null = null;
  let title: string | null = null;
  let name = raw;

  // 人事科-沈小芳
  const dash = raw.match(/^(.+?)-(.+)$/);
  if (dash) {
    department = dash[1]!.trim();
    name = dash[2]!.trim();
    return { name, title: null, department, confidence: "high", flags };
  }

  // 信息科王科长 / 财务科袁主任
  const deptTitle = raw.match(/^([\u4e00-\u9fff]{2,6}(?:科|办|部|中心))([\u4e00-\u9fff]{1,3})(科长|主任|副院长|院长|副科长|副主任|老师|护士长)$/);
  if (deptTitle) {
    department = deptTitle[1]!;
    name = deptTitle[2]!;
    title = deptTitle[3]!;
    flags.push("从「部门+姓+职称」拆出，姓名可能仅姓");
    return { name, title, department, confidence: "medium", flags };
  }

  // 周科长 / 姜主任
  const nameTitle = raw.match(/^([\u4e00-\u9fff]{1,3})(科长|主任|副院长|院长|副科长|副主任|老师|护士长)$/);
  if (nameTitle) {
    name = nameTitle[1]!;
    title = nameTitle[2]!;
    flags.push("姓名可能仅为姓或简称");
    return { name, title, department, confidence: "medium", flags };
  }

  // 已是正常人名
  if (/^[\u4e00-\u9fff]{2,4}$/.test(raw)) {
    return { name: raw, title: null, department: null, confidence: "high", flags };
  }

  flags.push("未能规则拆分，原样作姓名");
  return { name: raw, title: null, department: null, confidence: "low", flags };
}

function buildNotes(parts: {
  oldGrade: string | null;
  oldNotes: string | null;
  legacyOwner: string | null;
  ownerMode: string;
  rawNames: string[];
}): string {
  const lines: string[] = [];
  lines.push(`[import:${BATCH_ID}]`);
  if (parts.oldGrade) lines.push(`旧系统客户等级：${parts.oldGrade}`);
  if (parts.legacyOwner) {
    lines.push(
      parts.ownerMode === "POOL"
        ? `原主跟进人（已离职/历史）：${parts.legacyOwner}；导入后进入公海`
        : `原主跟进人：${parts.legacyOwner}`
    );
  }
  if (parts.rawNames.length > 1) {
    lines.push(`合并曾用名：${parts.rawNames.filter((n) => n !== parts.rawNames[0]).join("、")}`);
  }
  if (parts.oldNotes) lines.push(`旧备注：${parts.oldNotes}`);
  return lines.join("\n");
}

function softNorm(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/省|市|县|区/g, "")
    .replace(/第([一二三四五六七八九十\d]+)人民医院/, "第$1人民医院")
    .replace(/人民医院$/, "人民医院");
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  console.log("读取 Excel…");
  const customerRows = await readSheet(CUSTOMER_XLSX);
  const visitRows = await readSheet(VISIT_XLSX);
  console.log(`客户行 ${customerRows.length}，往来行 ${visitRows.length}`);

  // —— 聚合客户（按原始名称）——
  type Acc = {
    rawName: string;
    tags: Set<string>;
    sources: string[];
    types: string[];
    grades: string[];
    provinces: string[];
    cities: string[];
    districts: string[];
    addresses: string[];
    owners: string[];
    assistants: string[];
    notes: string[];
    createdAts: string[];
    contacts: Array<{
      raw: string;
      title: string | null;
      department: string | null;
      phone: string | null;
      wechat: string | null;
      gender: string | null;
      role: string | null;
    }>;
  };

  const byName = new Map<string, Acc>();

  for (const r of customerRows) {
    const rawName = blankToNull(cellStr(r["客户名称"]));
    if (!rawName) continue;
    let acc = byName.get(rawName);
    if (!acc) {
      acc = {
        rawName,
        tags: new Set(),
        sources: [],
        types: [],
        grades: [],
        provinces: [],
        cities: [],
        districts: [],
        addresses: [],
        owners: [],
        assistants: [],
        notes: [],
        createdAts: [],
        contacts: [],
      };
      byName.set(rawName, acc);
    }
    const tag = blankToNull(cellStr(r["客户标签"]));
    if (tag) acc.tags.add(tag);
    const push = (arr: string[], key: string) => {
      const v = blankToNull(cellStr(r[key]));
      if (v) arr.push(v);
    };
    push(acc.sources, "客户来源");
    push(acc.types, "客户类型");
    push(acc.grades, "客户等级");
    push(acc.provinces, "省份");
    // 省份可能是「江苏省-泰州市」
    push(acc.cities, "市");
    push(acc.districts, "地区");
    push(acc.addresses, "企业地址");
    push(acc.owners, "主跟进人");
    push(acc.assistants, "协作人");
    const other = blankToNull(cellStr(r["其他跟进人"]));
    if (other) acc.assistants.push(other);
    push(acc.notes, "备注");
    push(acc.createdAts, "创建时间");

    const contactRaw = blankToNull(cellStr(r["联系人"]));
    if (contactRaw) {
      acc.contacts.push({
        raw: contactRaw,
        title: blankToNull(cellStr(r["职务"])),
        department: blankToNull(cellStr(r["部门"])),
        phone: blankToNull(cellStr(r["手机"])),
        wechat: blankToNull(cellStr(r["微信"])),
        gender: blankToNull(cellStr(r["性别"])),
        role: blankToNull(cellStr(r["角色"])),
      });
    }
  }

  // —— 软归一合并疑似重复 ——
  const softGroups = new Map<string, string[]>();
  for (const name of byName.keys()) {
    const key = softNorm(name);
    const list = softGroups.get(key) ?? [];
    list.push(name);
    softGroups.set(key, list);
  }

  type Cluster = { key: string; names: string[]; primary: string };
  const clusters: Cluster[] = [];
  const nameToCluster = new Map<string, string>();

  for (const [soft, names] of softGroups) {
    // 选最长名作主名（通常更完整）
    const primary = [...names].sort((a, b) => b.length - a.length || a.localeCompare(b, "zh"))[0]!;
    const key = `C-${soft || primary}`;
    clusters.push({ key, names, primary });
    for (const n of names) nameToCluster.set(n, key);
  }

  const kimiCache = loadJsonCache<{
    officialName?: string | null;
    province?: string | null;
    city?: string | null;
    district?: string | null;
    hospitalLevel?: string | null;
    bedCount?: number | null;
    error?: string;
  }>(KIMI_CACHE);

  const prisma = new PrismaClient();
  const configRows = await prisma.configOption.findMany({
    where: { category: { in: ["customer_source", "customer_type"] }, enabled: true },
    select: { category: true, value: true, label: true },
  });
  const configMaps: ConfigMaps = {
    typeByLabel: new Map(),
    sourceByLabel: new Map(),
  };
  for (const row of configRows) {
    if (row.category === "customer_type") configMaps.typeByLabel.set(row.label, row.value);
    if (row.category === "customer_source") configMaps.sourceByLabel.set(row.label, row.value);
  }
  await prisma.$disconnect();

  const cleanCustomers: CleanCustomer[] = [];
  const cleanContacts: CleanContact[] = [];
  const duplicateReview: Array<Record<string, string>> = [];

  let kimiDone = 0;
  const toEnrich: Array<{ cluster: Cluster; category: "HOSPITAL" | "COMPANY"; hints: { province?: string; city?: string; district?: string } }> = [];

  for (const cluster of clusters) {
    // merge accs
    const accs = cluster.names.map((n) => byName.get(n)!);
    const tags = new Set<string>();
    const grades: string[] = [];
    const sources: string[] = [];
    const types: string[] = [];
    let province: string | null = null;
    let city: string | null = null;
    let district: string | null = null;
    let address: string | null = null;
    let owner: string | null = null;
    const assistants = new Set<string>();
    const notes: string[] = [];
    let createdAt: string | null = null;
    const contactBags: Acc["contacts"] = [];

    for (const acc of accs) {
      acc.tags.forEach((t) => tags.add(t));
      grades.push(...acc.grades);
      sources.push(...acc.sources);
      types.push(...acc.types);
      const nextProvince: string | null = province ?? blankToNull(acc.provinces[0] ?? "");
      if (!province && nextProvince) {
        if (nextProvince.includes("-") && !city) {
          const dash = nextProvince.indexOf("-");
          province = nextProvince.slice(0, dash) || nextProvince;
          city = nextProvince.slice(dash + 1) || city;
        } else {
          province = nextProvince;
        }
      }
      city = city || blankToNull(acc.cities[0] ?? "") || null;
      district = district || blankToNull(acc.districts[0] ?? "") || null;
      address = address || blankToNull(acc.addresses[0] ?? "") || null;
      owner = owner || blankToNull(acc.owners[0] ?? "") || null;
      acc.assistants.forEach((a) => a.split(/[、,，]/).forEach((x) => {
        const t = x.trim();
        if (t) assistants.add(t);
      }));
      notes.push(...acc.notes);
      createdAt = createdAt || blankToNull(acc.createdAts[0] ?? "") || null;
      contactBags.push(...acc.contacts);
    }

    const tagStr = [...tags].join(",");
    let category: "HOSPITAL" | "COMPANY" | "INDIVIDUAL" = "COMPANY";
    if (looksLikeHospital(cluster.primary, tagStr)) category = "HOSPITAL";
    else if (looksLikePerson(cluster.primary)) category = "INDIVIDUAL";

    const typeMapped = mapCustomerType(category, configMaps);
    const oldGrade = blankToNull(grades.find(Boolean) ?? "") || null;
    const sourceRaw = blankToNull(sources.find((s) => s && s !== "-") ?? "") || null;
    const sourceMapped = mapSource(sourceRaw, configMaps);
    const ownerMode = owner && ACTIVE_SALES.has(owner) ? "ACTIVE" : "POOL";
    const flags: string[] = [];
    if (cluster.names.length > 1) {
      flags.push(`疑似重复合并:${cluster.names.join("|")}`);
      duplicateReview.push({
        clusterKey: cluster.key,
        primary: cluster.primary,
        variants: cluster.names.join(" | "),
        count: String(cluster.names.length),
      });
    }
    if (owner && !ACTIVE_SALES.has(owner)) flags.push(`原负责人历史人员:${owner}`);
    if (sourceRaw && !sourceMapped.value) flags.push(`来源未映射:${sourceRaw}`);

    if (category === "HOSPITAL" || category === "COMPANY") {
      toEnrich.push({
        cluster,
        category,
        hints: {
          province: province ?? undefined,
          city: city ?? undefined,
          district: district ?? undefined,
        },
      });
    }

    cleanCustomers.push({
      legacyKey: cluster.key,
      rawNames: cluster.names,
      name: cluster.primary,
      category,
      customerType: typeMapped.value,
      customerTypeLabel: typeMapped.label,
      customerGrade: "NONE",
      source: sourceMapped.value,
      sourceLabel: sourceMapped.label,
      sourceRaw,
      province,
      city,
      district,
      address,
      hospitalLevel: null,
      bedCount: null,
      tags: tagStr,
      notes: buildNotes({
        oldGrade,
        oldNotes: blankToNull(notes.filter(Boolean).join("；") ?? "") || null,
        legacyOwner: owner,
        ownerMode,
        rawNames: cluster.names,
      }),
      ownerMode,
      ownerName: ownerMode === "ACTIVE" ? owner : null,
      legacyOwnerName: owner,
      assistants: [...assistants].filter((a) => a !== owner).join("、"),
      createdAt,
      kimiStatus: SKIP_KIMI ? "skipped" : "pending",
      reviewFlags: flags.join("；"),
    });

    // contacts dedupe by raw
    const seenContact = new Set<string>();
    for (const c of contactBags) {
      const key = `${c.raw}|${c.phone ?? ""}`;
      if (seenContact.has(key)) continue;
      seenContact.add(key);
      const split = splitContact(c.raw);
      const title = c.title || split.title;
      const department = c.department || split.department;
      const phone = cleanPhone(c.phone);
      const cFlags = [...split.flags];
      if (!phone && c.phone) cFlags.push(`原手机无效:${c.phone}`);
      if (split.confidence !== "high") cFlags.push(`置信度:${split.confidence}`);

      cleanContacts.push({
        customerLegacyKey: cluster.key,
        customerName: cluster.primary,
        name: split.name,
        title,
        department,
        phone,
        wechat: c.wechat,
        gender: c.gender,
        roleRaw: c.role,
        roleMapped: mapContactRole(c.role),
        rawContact: c.raw,
        confidence: split.confidence,
        reviewFlags: cFlags.join("；"),
      });
    }
  }

  // —— Kimi 补全 ——
  if (!SKIP_KIMI) {
    console.log(`Kimi 补全目标 ${Math.min(toEnrich.length, KIMI_LIMIT)} / ${toEnrich.length}（并发 ${CONCURRENCY}）…`);
    const slice = toEnrich.slice(0, KIMI_LIMIT);
    await mapPool(slice, CONCURRENCY, async (item, idx) => {
      const cacheKey = `${item.category}::${item.cluster.primary}`;
      const cust = cleanCustomers.find((c) => c.legacyKey === item.cluster.key);
      if (!cust) return null;

      if (kimiCache[cacheKey] && !kimiCache[cacheKey]!.error) {
        const cached = kimiCache[cacheKey]!;
        applyKimi(cust, cached);
        cust.kimiStatus = "cache";
        return null;
      }

      try {
        const result = await Promise.race([
          enrichCustomerWithKimi({
            name: item.cluster.primary,
            category: item.category,
            ...item.hints,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Kimi 超时(90s)")), 90_000)
          ),
        ]);
        kimiCache[cacheKey] = result;
        applyKimi(cust, result);
        cust.kimiStatus = "ok";
        kimiDone++;
        if (kimiDone % 5 === 0 || idx === slice.length - 1) {
          saveJsonCache(KIMI_CACHE, kimiCache);
          console.log(`  Kimi ${kimiDone}/${slice.length} — ${item.cluster.primary}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        kimiCache[cacheKey] = { error: msg };
        cust.kimiStatus = `error:${msg.slice(0, 80)}`;
        cust.reviewFlags = [cust.reviewFlags, "Kimi失败"].filter(Boolean).join("；");
        saveJsonCache(KIMI_CACHE, kimiCache);
        console.warn(`  Kimi 失败 ${item.cluster.primary}: ${msg}`);
        kimiDone++;
      }
      // 轻微限速
      await new Promise((r) => setTimeout(r, 200));
      return null;
    });
    saveJsonCache(KIMI_CACHE, kimiCache);
  }

  function applyKimi(
    cust: CleanCustomer,
    result: {
      officialName?: string | null;
      province?: string | null;
      city?: string | null;
      district?: string | null;
      hospitalLevel?: string | null;
      bedCount?: number | null;
    }
  ) {
    if (result.officialName?.trim()) {
      if (result.officialName.trim() !== cust.name) {
        cust.reviewFlags = [cust.reviewFlags, `名称变更:${cust.name}→${result.officialName}`]
          .filter(Boolean)
          .join("；");
        if (!cust.rawNames.includes(cust.name)) cust.rawNames.push(cust.name);
        cust.name = result.officialName.trim();
      }
    }
    cust.province = result.province?.trim() || cust.province;
    cust.city = result.city?.trim() || cust.city;
    cust.district = result.district?.trim() || cust.district;
    if (cust.category === "HOSPITAL") {
      cust.hospitalLevel = result.hospitalLevel ?? cust.hospitalLevel;
      cust.bedCount = result.bedCount ?? cust.bedCount;
      if (!cust.hospitalLevel) cust.reviewFlags = [cust.reviewFlags, "缺医院等级"].filter(Boolean).join("；");
      if (!cust.bedCount) cust.reviewFlags = [cust.reviewFlags, "缺床位数"].filter(Boolean).join("；");
    }
  }

  // 更新 contact 上的客户展示名
  const keyToName = new Map(cleanCustomers.map((c) => [c.legacyKey, c.name]));
  for (const c of cleanContacts) {
    c.customerName = keyToName.get(c.customerLegacyKey) ?? c.customerName;
  }

  // —— 往来 ——
  const visitAiCache = loadJsonCache<string>(VISIT_AI_CACHE);
  const cleanVisits: CleanVisit[] = [];
  const historicalPeople = new Map<string, { roles: Set<string>; visitCount: number; customerCount: Set<string> }>();

  function touchHistorical(name: string, role: string, customer?: string) {
    if (ACTIVE_SALES.has(name)) return;
    let h = historicalPeople.get(name);
    if (!h) {
      h = { roles: new Set(), visitCount: 0, customerCount: new Set() };
      historicalPeople.set(name, h);
    }
    h.roles.add(role);
    if (customer) h.customerCount.add(customer);
  }

  for (const c of cleanCustomers) {
    if (c.legacyOwnerName && !ACTIVE_SALES.has(c.legacyOwnerName)) {
      touchHistorical(c.legacyOwnerName, "原主跟进人", c.name);
    }
  }

  for (const r of visitRows) {
    const customerRaw = blankToNull(cellStr(r["客户名称"]));
    if (!customerRaw) continue;
    const clusterKey = nameToCluster.get(customerRaw) ?? null;
    // 尝试 soft 匹配
    let resolvedKey = clusterKey;
    if (!resolvedKey) {
      const soft = softNorm(customerRaw);
      const hit = clusters.find((c) => softNorm(c.primary) === soft || c.names.some((n) => softNorm(n) === soft));
      resolvedKey = hit?.key ?? null;
    }
    const customerName = resolvedKey ? keyToName.get(resolvedKey) ?? null : null;

    const planned = blankToNull(cellStr(r["预计沟通内容"]));
    const actual = blankToNull(cellStr(r["实际沟通内容"]));
    const status = blankToNull(cellStr(r["往来状态"])) || "";
    const sales = blankToNull(cellStr(r["负责销售"])) || blankToNull(cellStr(r["录入人"])) || "未知";
    const method = blankToNull(cellStr(r["往来方式"])) || "其他";
    const followUpAt =
      blankToNull(cellStr(r["实际开始时间"])) ||
      blankToNull(cellStr(r["提交时间"])) ||
      blankToNull(cellStr(r["创建时间"]));

    let content = "";
    let contentSource: CleanVisit["contentSource"] = "empty";
    if (actual && planned && actual === planned) {
      content = actual;
      contentSource = "same";
    } else if (actual && !planned) {
      content = actual;
      contentSource = "actual";
    } else if (planned && !actual) {
      content = planned;
      contentSource = "planned";
    } else if (actual && planned && actual !== planned) {
      const cacheKey = `${customerRaw}::${followUpAt}::${planned.slice(0, 40)}`;
      if (visitAiCache[cacheKey]) {
        content = visitAiCache[cacheKey]!;
        contentSource = "ai";
      } else if (!SKIP_KIMI) {
        try {
          const json = (await callKimiJson({
            system:
              "你是销售往来记录整理助手。把「预计沟通内容」与「实际沟通内容」综合成一条简洁、可查验的历史往来记录。保留关键事实与意向，去掉重复。只返回 JSON：{ content: string }",
            user: JSON.stringify({ 预计沟通内容: planned, 实际沟通内容: actual }),
            maxTokens: 1024,
          })) as { content?: string };
          content = (json.content || `${actual}\n（原计划：${planned}）`).trim();
          contentSource = "ai";
          visitAiCache[cacheKey] = content;
          saveJsonCache(VISIT_AI_CACHE, visitAiCache);
        } catch {
          content = `【实际】${actual}\n【预计】${planned}`;
          contentSource = "ai";
        }
      } else {
        content = `【实际】${actual}\n【预计】${planned}`;
        contentSource = "ai";
      }
    }

    const flags: string[] = [];
    if (!resolvedKey) flags.push("客户未匹配");
    let importDecision: "IMPORT" | "SKIP" = "IMPORT";
    let skipReason: string | null = null;
    if (status.includes("取消")) {
      importDecision = "SKIP";
      skipReason = "取消往来";
    } else if (!content) {
      importDecision = "SKIP";
      skipReason = "无沟通内容";
    } else if (status.includes("未签到") || status.includes("逾期") || status === "计划中") {
      // 仍导入有内容的，但标记
      flags.push(`原状态:${status}`);
    }

    if (!ACTIVE_SALES.has(sales)) {
      touchHistorical(sales, "负责销售", customerRaw);
    }
    const hist = historicalPeople.get(sales);
    if (hist) hist.visitCount += 1;

    cleanVisits.push({
      customerRawName: customerRaw,
      customerLegacyKey: resolvedKey,
      customerName,
      contactRaw: blankToNull(cellStr(r["联系人"])) || "",
      method,
      methodMapped: mapMethod(method),
      salesName: sales,
      salesIsHistorical: !ACTIVE_SALES.has(sales),
      plannedContent: planned,
      actualContent: actual,
      content,
      contentSource,
      followUpAt,
      statusRaw: status,
      importDecision,
      skipReason,
      reviewFlags: flags.join("；"),
    });
  }

  // —— 写 Excel ——
  console.log("写入待审 Excel…");
  const out = new ExcelJS.Workbook();
  out.creator = "hospital-crm-pm";
  out.created = new Date();

  const summary = out.addWorksheet("清洗说明");
  summary.addRows([
    ["批次", BATCH_ID],
    ["生成时间", new Date().toISOString()],
    ["客户簇数", cleanCustomers.length],
    ["联系人数", cleanContacts.length],
    ["往来数", cleanVisits.length],
    ["建议导入往来", cleanVisits.filter((v) => v.importDecision === "IMPORT").length],
    ["跳过往来", cleanVisits.filter((v) => v.importDecision === "SKIP").length],
    ["历史人员", historicalPeople.size],
    ["Kimi", SKIP_KIMI ? "已跳过" : "已执行（见缓存 tmp/legacy-import/kimi-cache.json）"],
    [],
    ["规则"],
    ["客户等级", "全部 NONE（未评级）；旧等级写入备注"],
    ["关系类型", "医院→直接客户；否则→渠道（value 对齐当前系统配置）"],
    ["客户类别", "名称/标签像医院→HOSPITAL；像人名→INDIVIDUAL；否则 COMPANY"],
    ["负责人", "在职销售挂名；离职/未知→公海，原负责人进备注与历史人员表"],
    ["批次标记", `备注含 [import:${BATCH_ID}]`],
    [],
    ["请人工重点看"],
    ["1", "客户主数据.reviewFlags / kimiStatus"],
    ["2", "疑似重复表"],
    ["3", "联系人.confidence=low 或 reviewFlags"],
    ["4", "往来.客户未匹配 / SKIP"],
    ["5", "确认无误后告知，再执行正式导入脚本"],
  ]);

  addSheet(
    out,
    "客户主数据",
    [
      "legacyKey",
      "name",
      "rawNames",
      "category",
      "customerType",
      "customerTypeLabel",
      "customerGrade",
      "source",
      "sourceLabel",
      "sourceRaw",
      "province",
      "city",
      "district",
      "address",
      "hospitalLevel",
      "bedCount",
      "tags",
      "ownerMode",
      "ownerName",
      "legacyOwnerName",
      "assistants",
      "createdAt",
      "kimiStatus",
      "reviewFlags",
      "notes",
    ],
    cleanCustomers.map((c) => ({
      ...c,
      rawNames: c.rawNames.join(" | "),
    }))
  );

  addSheet(
    out,
    "联系人",
    [
      "customerLegacyKey",
      "customerName",
      "name",
      "title",
      "department",
      "phone",
      "wechat",
      "gender",
      "roleRaw",
      "roleMapped",
      "rawContact",
      "confidence",
      "reviewFlags",
    ],
    cleanContacts
  );

  addSheet(
    out,
    "往来记录",
    [
      "importDecision",
      "skipReason",
      "customerRawName",
      "customerLegacyKey",
      "customerName",
      "contactRaw",
      "method",
      "methodMapped",
      "salesName",
      "salesIsHistorical",
      "followUpAt",
      "statusRaw",
      "contentSource",
      "content",
      "plannedContent",
      "actualContent",
      "reviewFlags",
    ],
    cleanVisits
  );

  addSheet(
    out,
    "历史人员",
    ["name", "roles", "visitCount", "relatedCustomersApprox", "note"],
    [...historicalPeople.entries()].map(([name, h]) => ({
      name,
      roles: [...h.roles].join("、"),
      visitCount: h.visitCount,
      relatedCustomersApprox: h.customerCount.size,
      note: "导入时建历史人员账号；其名下客户进公海；往来 user 关联此人以便查验",
    }))
  );

  addSheet(out, "疑似重复", ["clusterKey", "primary", "variants", "count"], duplicateReview);

  addSheet(
    out,
    "往来未匹配客户",
    ["customerRawName", "count"],
    Object.entries(
      cleanVisits
        .filter((v) => !v.customerLegacyKey)
        .reduce<Record<string, number>>((a, v) => {
          a[v.customerRawName] = (a[v.customerRawName] ?? 0) + 1;
          return a;
        }, {})
    ).map(([customerRawName, count]) => ({ customerRawName, count }))
  );

  await out.xlsx.writeFile(OUT_XLSX);
  console.log(`\n✓ 已生成：${OUT_XLSX}`);
  console.log(
    JSON.stringify(
      {
        customers: cleanCustomers.length,
        contacts: cleanContacts.length,
        visits: cleanVisits.length,
        visitsImport: cleanVisits.filter((v) => v.importDecision === "IMPORT").length,
        historical: historicalPeople.size,
        duplicates: duplicateReview.length,
        kimiOk: cleanCustomers.filter((c) => c.kimiStatus === "ok" || c.kimiStatus === "cache").length,
        kimiError: cleanCustomers.filter((c) => c.kimiStatus.startsWith("error")).length,
        missingHospitalLevel: cleanCustomers.filter((c) => c.category === "HOSPITAL" && !c.hospitalLevel).length,
        missingBedCount: cleanCustomers.filter((c) => c.category === "HOSPITAL" && !c.bedCount).length,
      },
      null,
      2
    )
  );
}

function addSheet(wb: ExcelJS.Workbook, name: string, columns: string[], rows: Array<Record<string, unknown>>) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(28, Math.max(12, c.length + 2)) }));
  for (const row of rows) {
    const r: Record<string, unknown> = {};
    for (const c of columns) r[c] = row[c] ?? "";
    ws.addRow(r);
  }
  ws.getRow(1).font = { bold: true };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
