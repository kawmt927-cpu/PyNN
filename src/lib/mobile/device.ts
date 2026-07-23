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
  return isPhoneOrWeComUserAgent(userAgent) ? "/mobile" : "/";
}
