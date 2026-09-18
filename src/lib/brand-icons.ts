/** 浏览器标签 / 收藏夹图标：线上蓝、本地橙，便于区分环境 */
export function resolveBrandIconPaths() {
  const isLocal =
    process.env.NODE_ENV === "development" ||
    /localhost|127\.0\.0\.1/.test(process.env.NEXTAUTH_URL ?? "") ||
    /localhost|127\.0\.0\.1/.test(process.env.PUBLIC_APP_URL ?? "");

  const variant = isLocal ? "local" : "prod";
  return {
    isLocal,
    variant,
    icon: `/brand/icon-${variant}.png`,
    icon32: `/brand/icon-${variant}-32.png`,
    apple: `/brand/icon-${variant}-180.png`,
  };
}
