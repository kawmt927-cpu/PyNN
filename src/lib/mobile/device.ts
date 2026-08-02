/** 手机 / 平板浏览器特征（不含仅含 wxwork 的 PC 企微） */
const MOBILE_DEVICE_UA = /android|iphone|ipod|ipad|mobile/i;

export function isMobileDeviceUserAgent(userAgent: string): boolean {
  return MOBILE_DEVICE_UA.test(userAgent);
}

/**
 * 应进入手机端 CRM 的 UA：
 * - 手机 / 平板浏览器
 * - 手机端企业微信（UA 同时含 wxwork 与 Mobile/Android/iPhone 等）
 *
 * PC 端企业微信（Windows / Mac）只含 wxwork、不含移动设备标识，返回 false。
 */
export function isPhoneOrWeComUserAgent(userAgent: string): boolean {
  return isMobileDeviceUserAgent(userAgent);
}

/** 企微 OAuth / 入口页的默认落地路径 */
export function getWeComDefaultReturnTo(userAgent: string): string {
  return isPhoneOrWeComUserAgent(userAgent) ? "/mobile/inbox" : "/";
}

/**
 * 将电脑端业务路径映射到手机端等价路径（保留深链，避免一律打回 /mobile 首页）。
 */
export function mapDesktopPathToMobile(pathname: string, search = ""): string | null {
  if (pathname.startsWith("/mobile")) return `${pathname}${search}`;

  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) {
    return "/mobile/inbox";
  }

  const customerFollow = pathname.match(/^\/customers\/([^/]+)\/follow-ups\/?$/);
  if (customerFollow) return `/mobile/customers/${customerFollow[1]}/follow-ups`;

  const customer = pathname.match(/^\/customers\/([^/]+)\/?$/);
  if (customer) return `/mobile/customers/${customer[1]}`;

  if (pathname === "/customers") return `/mobile/customers${search}`;

  const contract = pathname.match(/^\/contracts\/([^/]+)\/?$/);
  if (contract) return `/mobile/contracts/${contract[1]}`;
  if (pathname === "/contracts") return `/mobile/contracts${search}`;

  const opportunity = pathname.match(/^\/opportunities\/([^/]+)\/?$/);
  if (opportunity) return `/mobile/opportunities/${opportunity[1]}`;
  if (pathname === "/opportunities") return `/mobile/opportunities${search}`;

  if (pathname === "/follow-ups" || pathname.startsWith("/follow-ups/")) {
    return "/mobile/follow-ups";
  }
  if (pathname.startsWith("/today-work") || pathname.startsWith("/daily-reports")) {
    // 今日工作记录/团队动态 → 手机今日日志（保留 ?open= 深链）
    if (pathname.startsWith("/today-work")) {
      return `/mobile/activity${search}`;
    }
    return "/mobile/log";
  }
  if (pathname.startsWith("/sales-log")) {
    return "/mobile/check-in";
  }
  if (pathname.startsWith("/plans-tasks") || pathname === "/my-tasks") {
    return "/mobile/tasks";
  }

  return null;
}
