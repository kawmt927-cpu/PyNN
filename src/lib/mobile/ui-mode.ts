/** 显式选择电脑端（含手机浏览器调试 PC）时写入；缺省在手机 UA 下走手机端 */
export const UI_MODE_COOKIE = "crm_ui_mode";

export type UiMode = "pc" | "mobile";

export function parseUiMode(value: string | undefined | null): UiMode | null {
  if (value === "pc" || value === "mobile") return value;
  return null;
}

export const UI_MODE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
};
