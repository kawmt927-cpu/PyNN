import { NextResponse } from "next/server";
import { UI_MODE_COOKIE, UI_MODE_COOKIE_OPTIONS, parseUiMode } from "@/lib/mobile/ui-mode";

/** 登录成功后由客户端写入偏好（手机端强制 mobile） */
export async function POST(req: Request) {
  let mode: string | undefined;
  try {
    const body = (await req.json()) as { mode?: string };
    mode = body.mode;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const parsed = parseUiMode(mode);
  if (!parsed) {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, mode: parsed });
  res.cookies.set(UI_MODE_COOKIE, parsed, UI_MODE_COOKIE_OPTIONS);
  return res;
}
