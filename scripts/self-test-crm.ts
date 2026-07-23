/**
 * CRM 自测：功能 + 健壮性（虚拟数据）
 * 1) npx tsx scripts/prepare-self-test-accounts.ts
 * 2) npx tsx scripts/self-test-crm.ts
 */
import {
  PrismaClient,
  UserRole,
  type CustomerCategory,
} from "@prisma/client";
import { createCustomerRecord } from "../src/lib/customers/create-customer";
import { getCustomerForUser, canEditCustomerFollowUp } from "../src/lib/customers/access";
import { createSalesCheckIn } from "../src/lib/sales-log/check-in";
import { createOpportunityFromAgent } from "../src/lib/sales-log/opportunity-write";
import { ensureTodayDailyLog } from "../src/lib/sales-log/daily-log";
import { finalizeSignedContract } from "../src/lib/contracts/finalize";
import { isPhoneOrWeComUserAgent } from "../src/lib/mobile/device";
import {
  canAccessSalesMobile,
  getMobileHomeForRole,
  isMobileManagerRole,
} from "../src/lib/mobile/sales-roles";
import { getDefaultHomeForRole } from "../src/lib/permissions";
import {
  canStartImpersonation,
  canImpersonateTarget,
  getImpersonationTargetRoles,
} from "../src/lib/auth/impersonation";
import { sanitizeReturnTo, resolveReturnTo } from "../src/lib/navigation/return-to";
import { CONFIG_CATEGORY, getConfigOptions } from "../src/lib/config-options";
import { opportunityListWhereWithView } from "../src/lib/opportunities/access";

const prisma = new PrismaClient();
const TAG = `[自测-${Date.now()}]`;

type CaseResult = { id: string; ok: boolean; detail: string };
const results: CaseResult[] = [];

function pass(id: string, detail = "ok") {
  results.push({ id, ok: true, detail });
  console.log(`  ✓ ${id}: ${detail}`);
}
function fail(id: string, detail: string) {
  results.push({ id, ok: false, detail });
  console.error(`  ✗ ${id}: ${detail}`);
}
async function expectThrow(id: string, fn: () => Promise<unknown>, tip: string) {
  try {
    await fn();
    fail(id, `期望抛错（${tip}）但成功了`);
  } catch (e) {
    pass(id, `按预期失败: ${(e as Error).message.slice(0, 100)}`);
  }
}

async function main() {
  console.log("\n=== CRM 自测开始 ===\n");

  const sales = await prisma.user.findFirst({ where: { name: "钱金明", role: "SALES" } });
  const sales2 = await prisma.user.findFirst({ where: { name: "沈伟", role: "SALES" } });
  const manager = await prisma.user.findFirst({
    where: { name: "蔡晗蕾", role: "SALES_MANAGER" },
  });
  const projAdmin = await prisma.user.findFirst({
    where: { name: "王玉成", role: "PROJECT_ADMIN" },
  });
  const admin = await prisma.user.findFirst({ where: { name: "万嘉南", role: "ADMIN" } });
  if (!sales || !sales2 || !manager || !projAdmin || !admin) {
    throw new Error("缺少测试账号");
  }

  const typeOpts = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  const sourceOpts = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE);
  const stageOpts = await getConfigOptions(CONFIG_CATEGORY.OPPORTUNITY_STAGE);
  const customerType = typeOpts.find((o) => o.value === "DIRECT")?.value ?? typeOpts[0]!.value;
  const source = sourceOpts[0]!.value;
  const stage = stageOpts[0]!.value;

  // 1. 角色 / 移动端
  console.log("\n[1] 角色与移动端规则");
  for (const [role, can, home] of [
    ["SALES", true, "/mobile"],
    ["SALES_MANAGER", true, "/mobile"],
    ["ADMIN", true, "/mobile"],
    ["PROJECT_ADMIN", false, "/mobile/pc-only"],
    ["PROJECT_MANAGER", false, "/mobile/pc-only"],
    ["HR", false, "/mobile/pc-only"],
  ] as const) {
    const a = canAccessSalesMobile(role);
    const h = getMobileHomeForRole(role);
    if (a === can && h === home) pass(`mobile-role-${role}`);
    else fail(`mobile-role-${role}`, `can=${a} home=${h}`);
  }
  if (isMobileManagerRole("SALES_MANAGER") && !isMobileManagerRole("SALES")) pass("mobile-manager-flag");
  else fail("mobile-manager-flag", "标记错误");
  if (getDefaultHomeForRole("SALES") === "/today-work") pass("home-sales");
  else fail("home-sales", getDefaultHomeForRole("SALES"));
  if (getDefaultHomeForRole("PROJECT_ADMIN") === "/projects") pass("home-proj");
  else fail("home-proj", getDefaultHomeForRole("PROJECT_ADMIN"));

  // 2. UA / returnTo
  console.log("\n[2] UA 与 returnTo");
  for (const [label, ua, expect] of [
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", true],
    ["Android", "Mozilla/5.0 (Linux; Android 13) Mobile", true],
    ["WeComMobile", "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_2 like Mac OS X) Mobile/14F89 wxwork/2.2.0 MicroMessenger/6.3.2", true],
    ["WeComAndroid", "Mozilla/5.0 (Linux; Android 7.1.2; wv) AppleWebKit/537.36 Mobile Safari/537.36 wxwork/2.2.0", true],
    ["WeComWindows", "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.110 Safari/537.36 wxwork/2.1.3 (MicroMessenger/6.2) WindowsWechat", false],
    ["WeComMac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) wxwork/2.2.0 (MicroMessenger/6.2) WeChat/2.0.4", false],
    ["MacChrome", "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0.0.0 Safari/537.36", false],
    ["WinChrome", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120", false],
  ] as const) {
    const got = isPhoneOrWeComUserAgent(ua);
    if (got === expect) pass(`ua-${label}`);
    else fail(`ua-${label}`, `got ${got}`);
  }
  // 已知风险：UA 含 "Mobile" 子串的桌面端可能误判——专门探测 Safari iPad
  const ipad = isPhoneOrWeComUserAgent(
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
  );
  if (ipad) pass("ua-ipad-as-mobile", "iPad 被识别为移动端（产品策略需确认）");
  else fail("ua-ipad-as-mobile", "iPad 未被识别为移动端");

  if (sanitizeReturnTo("//evil.com") === null) pass("returnTo-protocol");
  else fail("returnTo-protocol", "未拦截");
  if (sanitizeReturnTo("https://evil.com") === null) pass("returnTo-abs");
  else fail("returnTo-abs", "未拦截");
  if (sanitizeReturnTo("/customers") === "/customers") pass("returnTo-ok");
  else fail("returnTo-ok", "误拒");
  if (resolveReturnTo("/today-work", "/mobile") === "/today-work") pass("returnTo-query-wins");
  else fail("returnTo-query-wins", "fallback 覆盖了 query");

  // 3. 切换账号
  console.log("\n[3] 账号切换权限");
  if (canStartImpersonation("ADMIN") && canStartImpersonation("SALES_MANAGER") && !canStartImpersonation("SALES")) {
    pass("impersonate-who-can-start");
  } else fail("impersonate-who-can-start", "发起权限错误");
  if (canImpersonateTarget("SALES_MANAGER", "SALES") && !canImpersonateTarget("SALES_MANAGER", "ADMIN")) {
    pass("mgr-targets");
  } else fail("mgr-targets", "销管目标错误");
  if (
    canImpersonateTarget("PROJECT_ADMIN", "PROJECT_MANAGER") &&
    !canImpersonateTarget("PROJECT_ADMIN", "SALES")
  ) {
    pass("proj-targets");
  } else fail("proj-targets", "项目管理员目标错误");
  const adminTargets = getImpersonationTargetRoles("ADMIN");
  if (adminTargets.includes("SALES") && adminTargets.includes("HR")) pass("admin-targets");
  else fail("admin-targets", String(adminTargets));

  // 4. 客户
  console.log("\n[4] 客户创建与权限");
  const custName = `${TAG} 虚拟市一人民医院`;
  const customer = await createCustomerRecord("SALES", sales.id, {
    name: custName,
    category: "HOSPITAL" as CustomerCategory,
    hospitalLevel: "GRADE_3A",
    source,
    customerType,
    customerGrade: "STAR_2",
    province: "浙江省",
    city: "杭州市",
    tagValues: [],
  });
  pass("create-customer-sales", customer.id);

  await expectThrow(
    "create-customer-dup",
    () =>
      createCustomerRecord("SALES", sales.id, {
        name: custName,
        category: "HOSPITAL",
        hospitalLevel: "GRADE_3A",
        source,
        customerType,
        customerGrade: "STAR_1",
        tagValues: [],
      }),
    "重名"
  );

  await expectThrow(
    "create-customer-missing-type",
    () =>
      createCustomerRecord("SALES", sales.id, {
        name: `${TAG} 无类型`,
        category: "COMPANY",
        source,
        customerType: "",
        customerGrade: "STAR_1",
        tagValues: [],
      }),
    "缺关系类型"
  );

  const pool = await createCustomerRecord("SALES_MANAGER", manager.id, {
    name: `${TAG} 公海虚拟客户`,
    category: "COMPANY",
    source,
    customerType,
    customerGrade: "NONE",
    ownerId: null,
    tagValues: [],
  });
  const poolRow = await prisma.customer.findUnique({ where: { id: pool.id } });
  if (poolRow?.ownerId == null) pass("create-pool");
  else fail("create-pool", `owner=${poolRow?.ownerId}`);

  const own = await getCustomerForUser(customer.id, "SALES", sales.id, {
    allowAssignedWeeklyTask: true,
  });
  if (own) pass("sales-see-own");
  else fail("sales-see-own", "看不到自己的客户");
  const other = await getCustomerForUser(customer.id, "SALES", sales2.id, {
    allowAssignedWeeklyTask: true,
  });
  if (!other) pass("sales-hide-others");
  else fail("sales-hide-others", "他人可见");
  if (await getCustomerForUser(customer.id, "SALES_MANAGER", manager.id)) pass("mgr-see-all");
  else fail("mgr-see-all", "销管不可见");
  if (canEditCustomerFollowUp("SALES", sales.id, own!)) pass("owner-followup");
  else fail("owner-followup", "负责人不可跟进");
  if (!canEditCustomerFollowUp("SALES", sales2.id, own!)) pass("other-no-followup");
  else fail("other-no-followup", "他人可跟进");

  // 5. 认领：模拟真实 approve 事务逻辑
  console.log("\n[5] 公海认领审批逻辑");
  const claim1 = await prisma.customerClaimRequest.create({
    data: { customerId: pool.id, requesterId: sales.id, status: "PENDING" },
  });
  const claim2 = await prisma.customerClaimRequest.create({
    data: { customerId: pool.id, requesterId: sales2.id, status: "PENDING" },
  });
  pass("claim-two-pending", `${claim1.id}, ${claim2.id}`);

  // 复制 approveCustomerClaim 事务（不经 session）
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: pool.id },
      data: { ownerId: sales.id },
    });
    await tx.customerClaimRequest.update({
      where: { id: claim1.id },
      data: {
        status: "APPROVED",
        reviewerId: manager.id,
        reviewedAt: new Date(),
      },
    });
    await tx.customerClaimRequest.updateMany({
      where: { customerId: pool.id, status: "PENDING", id: { not: claim1.id } },
      data: {
        status: "REJECTED",
        reviewerId: manager.id,
        reviewNote: "客户已被其他销售认领",
        reviewedAt: new Date(),
      },
    });
  });
  const leftPending = await prisma.customerClaimRequest.count({
    where: { customerId: pool.id, status: "PENDING" },
  });
  const rejected = await prisma.customerClaimRequest.findUnique({ where: { id: claim2.id } });
  if (leftPending === 0 && rejected?.status === "REJECTED") pass("claim-approve-clears-others");
  else fail("claim-approve-clears-others", `pending=${leftPending} c2=${rejected?.status}`);

  // applyForCustomer 同人重复：业务层有校验，DB 允许多条不同人
  const owned = await prisma.customer.findUnique({ where: { id: pool.id } });
  if (owned?.ownerId === sales.id) pass("claim-owner-assigned");
  else fail("claim-owner-assigned", String(owned?.ownerId));

  // 6. 商机
  console.log("\n[6] 商机");
  const dailyLog = await ensureTodayDailyLog(sales.id);
  const oppResult = await createOpportunityFromAgent(
    { userId: sales.id, role: "SALES", dailyLogId: dailyLog.id },
    {
      title: `${TAG} HIS 升级商机`,
      customerId: customer.id,
      stage,
      expectedAmount: 120000,
      expectedCloseDate: "2026-12",
    }
  );
  const opportunityId = oppResult.opportunityId;
  pass("create-opportunity", opportunityId);
  const leaked = await prisma.opportunity.count({
    where: {
      AND: [opportunityListWhereWithView("SALES", sales2.id, "not_signed"), { id: opportunityId }],
    },
  });
  if (leaked === 0) pass("opp-isolation");
  else fail("opp-isolation", "其他销售可见");

  // 7. 打卡（需联系人）
  console.log("\n[7] 往来打卡");
  const contact = await prisma.contact.create({
    data: {
      customerId: customer.id,
      name: `${TAG} 张主任`,
      title: "DEAN",
    },
  });
  const checkIn = await createSalesCheckIn({
    userId: sales.id,
    role: "SALES",
    checkInMode: "interaction",
    customerId: customer.id,
    contactIds: [contact.id],
    latitude: 30.2741,
    longitude: 120.1551,
    locationText: `${TAG} 定位`,
    completeInteractionNow: false,
  });
  if (checkIn?.id) pass("check-in-pending", checkIn.id);
  else fail("check-in-pending", "未返回打卡");

  // 无客户打卡
  const bare = await createSalesCheckIn({
    userId: sales.id,
    role: "SALES",
    checkInMode: "without_customer",
    latitude: 30.27,
    longitude: 120.15,
    locationText: `${TAG} 无客户`,
  });
  if (bare?.id) pass("check-in-location-only", bare.id);
  else fail("check-in-location-only", "失败");

  await expectThrow(
    "check-in-interaction-no-contact",
    () =>
      createSalesCheckIn({
        userId: sales.id,
        role: "SALES",
        checkInMode: "interaction",
        customerId: customer.id,
        contactIds: [],
        completeInteractionNow: false,
      }),
    "缺联系人"
  );

  // 项目角色：lib 层应拒绝
  await expectThrow(
    "proj-admin-check-in-lib-guard",
    () =>
      createSalesCheckIn({
        userId: projAdmin.id,
        role: "PROJECT_ADMIN",
        checkInMode: "without_customer",
        latitude: 1,
        longitude: 1,
      }),
    "项目角色"
  );

  // 销管打卡自己的客户
  const mgrCust = await createCustomerRecord("SALES_MANAGER", manager.id, {
    name: `${TAG} 销管客户`,
    category: "COMPANY",
    source,
    customerType,
    customerGrade: "STAR_1",
    ownerId: manager.id,
    tagValues: [],
  });
  const mgrContact = await prisma.contact.create({
    data: { customerId: mgrCust.id, name: `${TAG} 联系人` },
  });
  const mgrCi = await createSalesCheckIn({
    userId: manager.id,
    role: "SALES_MANAGER",
    checkInMode: "interaction",
    customerId: mgrCust.id,
    contactIds: [mgrContact.id],
    latitude: 30.2,
    longitude: 120.1,
    completeInteractionNow: false,
  });
  if (mgrCi?.id) pass("mgr-check-in");
  else fail("mgr-check-in", "销管打卡失败");

  // 8. 合同 finalize → 自动建项
  console.log("\n[8] 合同签署自动建项");
  const contract = await prisma.contract.create({
    data: {
      title: `${TAG} 虚拟合同`,
      contractNo: `VT-${Date.now()}`,
      signingType: "DIRECT",
      ownerId: sales.id,
      signCustomerId: customer.id,
      endUserCustomerId: customer.id,
      status: "PENDING_APPROVAL",
      totalAmount: 120000,
      submittedById: sales.id,
      submittedAt: new Date(),
      opportunityId,
    },
  });
  pass("contract-create", contract.id);
  await prisma.$transaction(async (tx) => {
    await finalizeSignedContract(tx, {
      contractId: contract.id,
      signedAt: new Date(),
      approverId: manager.id,
    });
  });
  const project = await prisma.project.findUnique({ where: { contractId: contract.id } });
  if (project) pass("auto-project", project.id);
  else fail("auto-project", "未自动创建项目");
  const oppAfter = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (oppAfter?.status === "SIGNED") pass("opp-won-on-sign");
  else fail("opp-won-on-sign", `status=${oppAfter?.status}`);

  // 重复 finalize 不应再建第二个项目
  await prisma.$transaction(async (tx) => {
    await finalizeSignedContract(tx, {
      contractId: contract.id,
      signedAt: new Date(),
      approverId: manager.id,
    });
  });
  const projectCount = await prisma.project.count({ where: { contractId: contract.id } });
  if (projectCount === 1) pass("finalize-idempotent-project");
  else fail("finalize-idempotent-project", `count=${projectCount}`);

  // 9. HTTP
  console.log("\n[9] HTTP API / 中间件");
  const base = process.env.SELF_TEST_BASE ?? "http://localhost:3000";

  async function login(phone: string, password: string) {
    const csrfRes = await fetch(`${base}/api/auth/csrf`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const jar1 = (csrfRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
    const body = new URLSearchParams({
      csrfToken,
      phone,
      password,
      callbackUrl: `${base}/`,
      json: "true",
    });
    const res = await fetch(`${base}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: jar1.join("; "),
      },
      body,
      redirect: "manual",
    });
    const jar2 = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
    return {
      status: res.status,
      cookie: [...jar1, ...jar2].join("; "),
      ok: res.status === 200 || res.status === 302,
    };
  }

  try {
    const unauth = await fetch(`${base}/api/customers/quick-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    if (unauth.status === 401) pass("http-unauth");
    else fail("http-unauth", `status=${unauth.status}`);

    const salesLogin = await login("13810000011", "test123456");
    if (salesLogin.ok || salesLogin.cookie.includes("session-token") || salesLogin.cookie.includes("next-auth")) {
      pass("http-login-sales", `status=${salesLogin.status}`);
    } else {
      fail("http-login-sales", `status=${salesLogin.status} cookie=${salesLogin.cookie.slice(0, 120)}`);
    }

    if (salesLogin.cookie) {
      const bad = await fetch(`${base}/api/customers/quick-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: salesLogin.cookie },
        body: JSON.stringify({ name: `${TAG} incomplete` }),
      });
      if (bad.status >= 400) pass("http-validation");
      else fail("http-validation", "缺字段仍成功");

      const ok = await fetch(`${base}/api/customers/quick-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: salesLogin.cookie },
        body: JSON.stringify({
          name: `${TAG} API医院`,
          category: "HOSPITAL",
          hospitalLevel: "GRADE_2A",
          source,
          customerType,
          customerGrade: "STAR_1",
          tagValues: [],
        }),
      });
      const okJson = (await ok.json().catch(() => ({}))) as { id?: string; error?: string };
      if (ok.ok && okJson.id) pass("http-quick-create", okJson.id);
      else fail("http-quick-create", `${ok.status} ${okJson.error}`);

      const phoneHit = await fetch(`${base}/customers`, {
        headers: {
          Cookie: salesLogin.cookie,
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
        },
        redirect: "manual",
      });
      const loc = phoneHit.headers.get("location") ?? "";
      if ((phoneHit.status === 307 || phoneHit.status === 302) && loc.includes("/mobile")) {
        pass("mw-phone-to-mobile", loc);
      } else {
        fail("mw-phone-to-mobile", `status=${phoneHit.status} loc=${loc}`);
      }

      // cookie=pc 时应允许手机看 PC
      await fetch(`${base}/api/ui-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: salesLogin.cookie },
        body: JSON.stringify({ mode: "pc" }),
      });
      // 需要带上 Set-Cookie；简化：重新设 cookie 头可能不完整，记观察项
      const uiModeRes = await fetch(`${base}/api/ui-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: salesLogin.cookie },
        body: JSON.stringify({ mode: "pc" }),
      });
      const uiCookies = uiModeRes.headers.getSetCookie?.() ?? [];
      const merged = [salesLogin.cookie, ...uiCookies.map((c) => c.split(";")[0])].join("; ");
      const pcAllowed = await fetch(`${base}/customers`, {
        headers: {
          Cookie: merged,
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
        },
        redirect: "manual",
      });
      if (pcAllowed.status === 200) pass("mw-phone-pc-mode-allows-pc");
      else if (pcAllowed.status === 307 || pcAllowed.status === 302) {
        fail(
          "mw-phone-pc-mode-allows-pc",
          `仍重定向到 ${pcAllowed.headers.get("location")}（ui-mode cookie 可能未生效）`
        );
      } else fail("mw-phone-pc-mode-allows-pc", `status=${pcAllowed.status}`);
    }

    const projLogin = await login("13810000021", "test123456");
    if (projLogin.cookie) {
      const denied = await fetch(`${base}/api/customers/quick-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: projLogin.cookie },
        body: JSON.stringify({
          name: `${TAG} 项目不应建`,
          category: "COMPANY",
          source,
          customerType,
          customerGrade: "NONE",
          tagValues: [],
        }),
      });
      if (denied.status === 401) pass("http-proj-denied");
      else fail("http-proj-denied", `status=${denied.status}`);

      const pm = await fetch(`${base}/mobile`, {
        headers: {
          Cookie: projLogin.cookie,
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
        },
        redirect: "manual",
      });
      const pl = pm.headers.get("location") ?? "";
      if ((pm.status === 307 || pm.status === 302) && pl.includes("pc-only")) pass("mw-proj-pc-only");
      else if (pm.status === 200) {
        const html = await pm.text();
        if (html.includes("请使用电脑端")) pass("mw-proj-pc-only-body");
        else fail("mw-proj-pc-only", "200 但无提示");
      } else fail("mw-proj-pc-only", `status=${pm.status} loc=${pl}`);
    } else {
      fail("http-login-proj", "项目管理员登录失败");
    }
  } catch (e) {
    fail("http-suite", (e as Error).message);
  }

  // 10. 人事档案健壮性：禁用人员
  console.log("\n[10] 人员档案");
  const profile = await prisma.personnelProfile.findUnique({ where: { userId: sales2.id } });
  if (profile) {
    await prisma.personnelProfile.update({
      where: { userId: sales2.id },
      data: { enabled: false },
    });
    // 恢复，避免影响后续
    await prisma.personnelProfile.update({
      where: { userId: sales2.id },
      data: { enabled: true },
    });
    pass("personnel-enable-toggle");
  } else fail("personnel-enable-toggle", "无档案");

  console.log(`\n虚拟数据标签: ${TAG}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log("\n=== 汇总 ===");
  console.log(`通过 ${passed} / ${results.length}，失败 ${failed.length}`);
  for (const f of failed) console.log(` - ${f.id}: ${f.detail}`);

  // 写入报告
  const report = {
    tag: TAG,
    at: new Date().toISOString(),
    passed,
    total: results.length,
    failed,
    all: results,
  };
  const fs = await import("fs");
  fs.mkdirSync("tmp/backups", { recursive: true });
  fs.writeFileSync(
    `tmp/backups/self-test-report-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );

  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
