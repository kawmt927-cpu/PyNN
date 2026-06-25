"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WeComQrLogin } from "@/components/auth/wecom-qr-login";

const ERROR_MESSAGES: Record<string, string> = {
  wecom_not_configured: "企业微信登录尚未配置，请联系管理员。",
  wecom_auth_failed: "企业微信登录失败或已过期，请重新扫码。",
};

function WeComLoginSectionInner() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/";
  const error = searchParams.get("error");

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium">企业微信登录</p>
        <p className="text-xs text-muted-foreground">PC 浏览器请扫码；企微内打开可点下方授权链接</p>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {ERROR_MESSAGES[error] ?? "登录失败，请重试。"}
        </p>
      ) : null}
      <WeComQrLogin returnTo={returnTo} />
    </div>
  );
}

export function WeComLoginSection() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/wecom/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setConfigured(Boolean(data?.configured)))
      .catch(() => setConfigured(false));
  }, []);

  if (configured !== true) return null;

  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">加载企微登录…</p>}>
      <WeComLoginSectionInner />
    </Suspense>
  );
}
