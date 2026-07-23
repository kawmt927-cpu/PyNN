/**
 * 为操作手册截取有数据的界面截图（本地开发）。
 * 运行：npx tsx scripts/capture-manual-screenshots.ts
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "path";
import fs from "fs";

const BASE = process.env.MANUAL_BASE_URL ?? "http://localhost:3000";
const ROOT = path.resolve(__dirname, "..");
const SALES_ASSETS = path.join(ROOT, "docs/manuals/sales/assets");
const PROJECT_ASSETS = path.join(ROOT, "docs/manuals/project/assets");

const ACCOUNTS = {
  manager: { phone: "13810000002", password: "test123456" },
  sales: { phone: "13810000011", password: "test123456" },
  project: { phone: "13810000021", password: "test123456" },
} as const;

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function dismissNoise(page: Page) {
  // Next.js / 第三方浮层尽量收起，避免进手册
  await page.evaluate(() => {
    const issue = document.querySelector("[data-nextjs-toast], [data-nextjs-dialog-overlay]");
    if (issue) (issue as HTMLElement).style.display = "none";
    document.querySelectorAll("button").forEach((btn) => {
      if (btn.textContent?.includes("Issue") || btn.getAttribute("aria-label")?.includes("Close")) {
        try {
          (btn as HTMLButtonElement).click();
        } catch {
          /* ignore */
        }
      }
    });
  }).catch(() => undefined);
}

async function login(page: Page, phone: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#phone", phone);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForTimeout(800);
}

async function shot(page: Page, filePath: string) {
  await dismissNoise(page);
  await page.waitForTimeout(400);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: false });
  console.log("✓", path.relative(ROOT, filePath));
}

async function withDesktop(
  browser: Browser,
  account: { phone: string; password: string },
  fn: (page: Page) => Promise<void>
) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  // 强制 PC 模式，避免手机 UA 误判
  await context.addCookies([
    { name: "crm_ui_mode", value: "pc", domain: "localhost", path: "/" },
  ]);
  const page = await context.newPage();
  try {
    await login(page, account.phone, account.password);
    await fn(page);
  } finally {
    await context.close();
  }
}

async function withMobile(
  browser: Browser,
  account: { phone: string; password: string },
  fn: (page: Page) => Promise<void>
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: MOBILE_UA,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  await context.addCookies([
    { name: "crm_ui_mode", value: "mobile", domain: "localhost", path: "/" },
  ]);
  const page = await context.newPage();
  try {
    await login(page, account.phone, account.password);
    await fn(page);
  } finally {
    await context.close();
  }
}

async function main() {
  // 优先用本机 Chrome，避免下载 Playwright 自带 Chromium
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });

  // 登录页
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await shot(page, path.join(SALES_ASSETS, "01-login.png"));
    await context.close();
  }

  // 销管 PC
  await withDesktop(browser, ACCOUNTS.manager, async (page) => {
    await page.goto(`${BASE}/today-work`, { waitUntil: "networkidle" });
    await shot(page, path.join(SALES_ASSETS, "02-today-work.png"));

    await page.goto(`${BASE}/customers`, { waitUntil: "networkidle" });
    // 优先按名称筛演示数据，列表更干净
    const search = page.getByPlaceholder(/客户名称|搜索|名称/);
    if (await search.count()) {
      await search.first().fill("【手册演示】");
      await page.waitForTimeout(800);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    } else {
      await page.waitForTimeout(600);
    }
    await shot(page, path.join(SALES_ASSETS, "03-customers.png"));

    await page.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await shot(page, path.join(SALES_ASSETS, "04-approvals.png"));

    await page.goto(`${BASE}/opportunities`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await shot(page, path.join(SALES_ASSETS, "05-opportunities.png"));
  });

  // 销管手机
  await withMobile(browser, ACCOUNTS.manager, async (page) => {
    await page.goto(`${BASE}/mobile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, path.join(SALES_ASSETS, "06-mobile-manager-home.png"));

    await page.goto(`${BASE}/mobile/more`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await shot(page, path.join(SALES_ASSETS, "07-mobile-more.png"));
  });

  // 销售 PC + 手机
  await withDesktop(browser, ACCOUNTS.sales, async (page) => {
    await page.goto(`${BASE}/today-work`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, path.join(SALES_ASSETS, "08-today-work-sales.png"));
  });

  await withMobile(browser, ACCOUNTS.sales, async (page) => {
    await page.goto(`${BASE}/mobile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, path.join(SALES_ASSETS, "09-mobile-sales-home.png"));

    await page.goto(`${BASE}/mobile/check-in`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, path.join(SALES_ASSETS, "10-mobile-check-in.png"));
  });

  // 项目侧
  await withDesktop(browser, ACCOUNTS.project, async (page) => {
    await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, path.join(PROJECT_ASSETS, "01-projects.png"));

    await page.goto(`${BASE}/projects/schedule`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, path.join(PROJECT_ASSETS, "02-schedule.png"));

    await page.goto(`${BASE}/personnel`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, path.join(PROJECT_ASSETS, "03-personnel.png"));

    // 额外：项目详情计划 Tab（写入手册后可用）
    await page.goto(`${BASE}/projects/cmrp81izs001h8lvjj8enwgs0?tab=plan`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1000);
    await shot(page, path.join(PROJECT_ASSETS, "04-project-plan.png"));
  });

  await browser.close();
  console.log("全部截图完成");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
