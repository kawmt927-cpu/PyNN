import { LoginForm } from "./login-form";
import { resolveReturnTo } from "@/lib/navigation/return-to";
import { headers } from "next/headers";
import { isPhoneOrWeComUserAgent } from "@/lib/mobile/device";

type SearchParams = Promise<{ returnTo?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const ua = (await headers()).get("user-agent") ?? "";
  const onPhone = isPhoneOrWeComUserAgent(ua);
  const mobileDefault = onPhone ? "/mobile" : "/";
  let returnTo = resolveReturnTo(params.returnTo, mobileDefault);
  // 手机登录忽略电脑端 returnTo，避免会话过期后仍跳回 PC 壳
  if (onPhone && !returnTo.startsWith("/mobile")) {
    returnTo = "/mobile";
  }
  return (
    <LoginForm
      returnTo={returnTo}
      forceMobileUi={onPhone}
      wecomError={params.error ?? null}
    />
  );
}
