/**
 * 将清洗待审 Excel 导入本地数据库。
 * 用法：npx tsx scripts/legacy-crm-import.ts
 */
import ExcelJS from "exceljs";
import { PrismaClient, type FollowUpMethod, type HospitalLevel, type UserRole } from "@prisma/client";

const XLSX = "/Users/wanjianan/Downloads/培安CRM-旧数据清洗待审.xlsx";
const BATCH_MARK = "[import:legacy-crm-";

const prisma = new PrismaClient();

type SheetRow = Record<string, unknown>;

async function readSheet(name: string): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
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
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function nullStr(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = str(v);
  // 2021-06-04 16:03:36
  const d = new Date(s.replace(/-/g, "/"));
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function parseHospitalLevel(v: unknown): HospitalLevel | null {
  const s = str(v);
  const allowed = new Set([
    "GRADE_3A",
    "GRADE_3B",
    "GRADE_3",
    "GRADE_2A",
    "GRADE_2B",
    "GRADE_2",
    "OTHER",
  ]);
  return allowed.has(s) ? (s as HospitalLevel) : null;
}

function parseMethod(v: unknown): FollowUpMethod {
  const s = str(v);
  if (s === "FACE_VISIT" || s === "WECHAT" || s === "PHONE" || s === "ONLINE_MEETING") return s;
  return "OTHER";
}

async function ensureHistoricalUser(name: string): Promise<string> {
  const existing = await prisma.user.findFirst({ where: { name } });
  if (existing) {
    // 确保有销售档案且标记停用（历史人员）
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
  console.log("创建历史人员", name, user.id);
  return user.id;
}

async function main() {
  console.log("读取清洗表…");
  const customers = await readSheet("客户主数据");
  const contacts = await readSheet("联系人");
  const visits = await readSheet("往来记录");
  const historical = await readSheet("历史人员");

  // 若本批次已导入过，先清理（按备注前缀）
  const existingBatch = await prisma.customer.findMany({
    where: { notes: { contains: BATCH_MARK } },
    select: { id: true },
  });
  if (existingBatch.length) {
    const ids = existingBatch.map((c) => c.id);
    console.log(`发现已导入批次客户 ${ids.length} 个，先删除后重导…`);
    await prisma.followUp.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.contact.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customerAssistant.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customerTag.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  }

  // 用户名 → id
  const allUsers = await prisma.user.findMany({ select: { id: true, name: true, role: true } });
  const userByName = new Map(allUsers.map((u) => [u.name, u.id]));

  for (const h of historical) {
    const name = str(h.name);
    if (!name) continue;
    const id = await ensureHistoricalUser(name);
    userByName.set(name, id);
  }

  // 兜底：往来里出现的历史销售
  for (const name of ["李雪晴", "糜丽", "黄瀚霖"]) {
    if (!userByName.has(name)) {
      const id = await ensureHistoricalUser(name);
      userByName.set(name, id);
    }
  }

  const adminFallback =
    userByName.get("万嘉南") ||
    userByName.get("蔡晗蕾") ||
    allUsers.find((u) => u.role === "ADMIN" || u.role === "SALES_MANAGER")?.id;
  if (!adminFallback) throw new Error("找不到管理员/销管作为往来兜底 userId");

  // 标签选项
  const tagOptions = await prisma.configOption.findMany({
    where: { category: "customer_tag", enabled: true },
    select: { value: true, label: true },
  });
  const tagByLabel = new Map(tagOptions.map((t) => [t.label, t.value]));

  const legacyKeyToCustomerId = new Map<string, string>();
  let customerOk = 0;
  let customerSkip = 0;

  console.log(`导入客户 ${customers.length}…`);
  for (const row of customers) {
    const legacyKey = str(row.legacyKey);
    const name = str(row.name);
    if (!legacyKey || !name) {
      customerSkip++;
      continue;
    }

    // 与现有非本批次客户重名则跳过并记录
    const dup = await prisma.customer.findFirst({
      where: {
        name,
        NOT: { notes: { contains: BATCH_MARK } },
      },
      select: { id: true },
    });
    if (dup) {
      console.warn("跳过重名（已有客户）", name);
      legacyKeyToCustomerId.set(legacyKey, dup.id);
      customerSkip++;
      continue;
    }

    const ownerMode = str(row.ownerMode);
    const ownerName = nullStr(row.ownerName);
    let ownerId: string | null = null;
    if (ownerMode === "ACTIVE" && ownerName && userByName.has(ownerName)) {
      ownerId = userByName.get(ownerName)!;
    } else {
      ownerId = null; // 公海
    }

    const category = str(row.category) as "HOSPITAL" | "COMPANY" | "INDIVIDUAL";
    const customerType = str(row.customerType) || "DIRECT";
    const customerGrade = str(row.customerGrade) || "NONE";
    const source = nullStr(row.source);
    const createdAt = parseDate(row.createdAt) ?? new Date();

    const customer = await prisma.customer.create({
      data: {
        name,
        category,
        hospitalLevel: category === "HOSPITAL" ? parseHospitalLevel(row.hospitalLevel) : null,
        province: nullStr(row.province),
        city: nullStr(row.city),
        district: nullStr(row.district),
        bedCount: (() => {
          const n = Number(row.bedCount);
          return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
        })(),
        source,
        customerType,
        customerGrade,
        notes: nullStr(row.notes),
        ownerId,
        createdAt,
        updatedAt: createdAt,
      },
    });

    legacyKeyToCustomerId.set(legacyKey, customer.id);

    // tags
    const tagsRaw = str(row.tags);
    if (tagsRaw) {
      for (const label of tagsRaw.split(/[,，]/).map((x) => x.trim()).filter(Boolean)) {
        const value = tagByLabel.get(label) ?? label;
        await prisma.customerTag.upsert({
          where: { customerId_tagValue: { customerId: customer.id, tagValue: value } },
          create: { customerId: customer.id, tagValue: value },
          update: {},
        });
      }
    }

    // assistants
    const assistants = str(row.assistants);
    if (assistants) {
      for (const an of assistants.split(/[、,，]/).map((x) => x.trim()).filter(Boolean)) {
        const uid = userByName.get(an);
        if (!uid || uid === ownerId) continue;
        await prisma.customerAssistant.upsert({
          where: { customerId_userId: { customerId: customer.id, userId: uid } },
          create: { customerId: customer.id, userId: uid },
          update: {},
        });
      }
    }

    customerOk++;
    if (customerOk % 50 === 0) console.log(`  客户 ${customerOk}/${customers.length}`);
  }

  console.log(`导入联系人 ${contacts.length}…`);
  // customerId -> list of contacts for matching visits
  const contactsByCustomer = new Map<string, Array<{ id: string; name: string; raw: string }>>();
  let contactOk = 0;

  for (const row of contacts) {
    const legacyKey = str(row.customerLegacyKey);
    const customerId = legacyKeyToCustomerId.get(legacyKey);
    if (!customerId) continue;

    const name = str(row.name) || "未知联系人";
    const contact = await prisma.contact.create({
      data: {
        customerId,
        name,
        title: nullStr(row.title),
        department: nullStr(row.department),
        phone: nullStr(row.phone),
        wechat: nullStr(row.wechat),
        role: nullStr(row.roleMapped) || "OTHER",
      },
    });
    const list = contactsByCustomer.get(customerId) ?? [];
    list.push({ id: contact.id, name, raw: str(row.rawContact) });
    contactsByCustomer.set(customerId, list);
    contactOk++;
  }

  function matchContactId(customerId: string, contactRaw: string): string | null {
    const list = contactsByCustomer.get(customerId);
    if (!list?.length) return null;
    const raw = contactRaw.trim();
    if (!raw) return list[0]?.id ?? null;
    const byRaw = list.find((c) => c.raw === raw);
    if (byRaw) return byRaw.id;
    const byName = list.find((c) => c.name === raw || raw.includes(c.name));
    if (byName) return byName.id;
    return list[0]?.id ?? null;
  }

  console.log(`导入往来…`);
  let visitOk = 0;
  let visitSkip = 0;
  for (const row of visits) {
    if (str(row.importDecision) !== "IMPORT") {
      visitSkip++;
      continue;
    }
    const legacyKey = str(row.customerLegacyKey);
    let customerId = legacyKey ? legacyKeyToCustomerId.get(legacyKey) : undefined;
    if (!customerId) {
      const cname = str(row.customerName);
      if (cname) {
        const found = await prisma.customer.findFirst({
          where: { name: cname },
          select: { id: true },
        });
        customerId = found?.id;
      }
    }
    if (!customerId) {
      visitSkip++;
      continue;
    }

    const content = str(row.content);
    if (!content) {
      visitSkip++;
      continue;
    }

    const salesName = str(row.salesName);
    const userId = (salesName && userByName.get(salesName)) || adminFallback;
    const followUpAt = parseDate(row.followUpAt) ?? new Date();
    const contactId = matchContactId(customerId, str(row.contactRaw));
    const method = parseMethod(row.methodMapped);

    const legacyTag = "【旧CRM】";
    const body = content.replace(/^【旧CRM[·・]?[^】]*】\s*/, "").trim();
    const followUp = await prisma.followUp.create({
      data: {
        customerId,
        contactId,
        userId,
        method,
        content: body.endsWith(legacyTag) ? body : `${body}${legacyTag}`,
        followUpAt,
        createdAt: followUpAt,
        updatedAt: followUpAt,
      },
    });

    if (contactId) {
      await prisma.followUpContact.upsert({
        where: { followUpId_contactId: { followUpId: followUp.id, contactId } },
        create: { followUpId: followUp.id, contactId },
        update: {},
      });
    }

    visitOk++;
    if (visitOk % 100 === 0) console.log(`  往来 ${visitOk}`);
  }

  const summary = {
    customersImported: customerOk,
    customersSkipped: customerSkip,
    contactsImported: contactOk,
    visitsImported: visitOk,
    visitsSkipped: visitSkip,
    historicalUsers: ["李雪晴", "糜丽", "黄瀚霖"].map((n) => ({
      name: n,
      id: userByName.get(n) ?? null,
    })),
    totals: {
      customers: await prisma.customer.count(),
      contacts: await prisma.contact.count(),
      followUps: await prisma.followUp.count(),
      poolCustomers: await prisma.customer.count({ where: { ownerId: null } }),
    },
  };

  console.log("\n✓ 导入完成");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
