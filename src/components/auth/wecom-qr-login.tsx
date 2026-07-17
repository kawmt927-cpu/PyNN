"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WECOM_WWLOGIN_SCRIPT_URL } from "@/lib/wecom/oauth-flow";

type Props = {
  returnTo?: string;
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("加载企业微信登录组件失败"));
    document.body.appendChild(script);
  });
}

export function WeComQrLogin({ returnTo = "/mobile" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const params = new URLSearchParams({ returnTo });
        const res = await fetch(`/api/auth/wecom/web-login-config?${params}`, {
          credentials: "include",
        });
        const data = (await res.json()) as {
          configured?: boolean;
          corpId?: string;
          agentId?: number;
          redirectUri?: string;
          state?: string;
        };

        if (!res.ok || !data.configured || !data.corpId || !data.agentId || !data.redirectUri || !data.state) {
          if (!cancelled) {
            setError("企业微信登录未配置");
            setLoading(false);
          }
          return;
        }

        await loadScript(WECOM_WWLOGIN_SCRIPT_URL);
        if (cancelled || !containerRef.current) return;

        // Only touch this host via DOM APIs — never put React children inside it.
        const host = containerRef.current;
        while (host.firstChild) {
          host.removeChild(host.firstChild);
        }
        const mount = document.createElement("div");
        mount.id = "wecom_qr_login";
        host.appendChild(mount);

        // WwLogin is a constructor; calling without `new` breaks createFrame.
        const WwLogin = window.WwLogin;
        if (!WwLogin) {
          throw new Error("企业微信登录组件未加载");
        }
        new WwLogin({
          id: "wecom_qr_login",
          appid: data.corpId,
          agentid: data.agentId,
          redirect_uri: encodeURIComponent(data.redirectUri),
          state: data.state,
          lang: "zh",
        });

        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "初始化扫码登录失败");
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [returnTo]);

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading && !error ? (
        <p className="text-center text-sm text-muted-foreground">加载企业微信扫码…</p>
      ) : null}
      <div
        ref={containerRef}
        className="flex min-h-[220px] items-center justify-center rounded-md border bg-background p-4"
        suppressHydrationWarning
      />
      <Button asChild variant="outline" className="w-full" type="button">
        <a href={`/api/auth/wecom?returnTo=${encodeURIComponent(returnTo === "/" ? "/mobile" : returnTo)}`}>
          已在企业微信内打开？点此授权登录
        </a>
      </Button>
    </div>
  );
}
