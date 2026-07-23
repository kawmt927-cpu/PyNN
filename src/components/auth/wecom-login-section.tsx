"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WeComQrLogin } from "@/components/auth/wecom-qr-login";

const ERROR_MESSAGES: Record<string, string> = {
  wecom_not_configured: "企业微信登录尚未配置，请联系管理员。",
  wecom_auth_failed: "企业微信登录失败或已过期，请重新授权。",
  wecom_ip_denied:
    "服务器 IP 未加入企微「企业可信IP」。请管理员在企微后台加入 122.51.86.223 后重试。",
};

type Props = {
  returnTo?: string;
  error?: string | null;
};

export function WeComLoginSection({ returnTo = "/", error = null }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [inWeCom, setInWeCom] = useState(false);
  const [onPhone, setOnPhone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setInWeCom(/wxwork/i.test(ua));
    // 仅手机/平板；PC 企微不含 Mobile/Android/iPhone，走电脑端
    setOnPhone(/android|iphone|ipod|ipad|mobile/i.test(ua));
  }, []);

  useEffect(() => {
    fetch("/api/auth/wecom/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setConfigured(Boolean(data?.configured)))
      .catch(() => setConfigured(false));
  }, []);

  if (configured !== true) return null;

  // 手机（含手机企微）→ 手机端；PC 企微 / PC 扫码 → 电脑端
  const wecomReturnTo = onPhone
    ? "/mobile"
    : returnTo.startsWith("/mobile")
      ? returnTo
      : returnTo === "/" || !returnTo
        ? "/"
        : returnTo;
  const href = `/api/auth/wecom?returnTo=${encodeURIComponent(wecomReturnTo)}`;

  if (inWeCom || onPhone) {
    return (
      <div className="space-y-4 border-t pt-4">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium">企业微信登录</p>
          <p className="text-xs text-muted-foreground">
            {inWeCom
              ? onPhone
                ? "检测到手机企业微信，将进入手机端"
                : "检测到电脑企业微信，将进入电脑端"
              : "手机浏览器将进入手机端"}
          </p>
        </div>
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {ERROR_MESSAGES[error] ?? "登录失败，请重试。"}
          </p>
        ) : null}
        <Button asChild className="w-full" type="button">
          <a href={href}>企业微信一键登录</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium">企业微信登录</p>
        <p className="text-xs text-muted-foreground">
          PC 扫码或电脑企微进入电脑端；手机企微 / 手机浏览器进入手机端
        </p>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {ERROR_MESSAGES[error] ?? "登录失败，请重试。"}
        </p>
      ) : null}
      <WeComQrLogin returnTo={wecomReturnTo} />
    </div>
  );
}
