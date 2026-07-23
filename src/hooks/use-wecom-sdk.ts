"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as ww from "@wecom/jssdk";

type SdkConfigPayload = {
  corpId: string;
  agentId: number;
  corp: { nonceStr: string; timestamp: number; signature: string };
  agent: { nonceStr: string; timestamp: number; signature: string };
};

const JS_API_LIST = [
  "getLocation",
  "startRecord",
  "stopRecord",
  "onVoiceRecordEnd",
  "translateVoice",
] as const;

async function fetchJsSdkConfig(url: string): Promise<SdkConfigPayload> {
  const res = await fetch(`/api/wecom/js-sdk-config?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "获取 JS-SDK 配置失败");
  }
  return (await res.json()) as SdkConfigPayload;
}

function formatSdkError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const o = err as { errMsg?: string; message?: string; err_msg?: string };
    if (o.errMsg) return o.errMsg;
    if (o.err_msg) return o.err_msg;
    if (o.message) return o.message;
  }
  return "企业微信 JS-SDK 初始化失败";
}

export function useWeComSdk(enabled: boolean) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceEndHandlerRef = useRef<((localId: string) => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      try {
        const pageUrl = window.location.href.split("#")[0] ?? "";
        const bootstrap = await fetchJsSdkConfig(pageUrl);

        ww.register({
          corpId: bootstrap.corpId,
          agentId: bootstrap.agentId,
          jsApiList: [...JS_API_LIST],
          getConfigSignature: async (url) => {
            const cfg = await fetchJsSdkConfig(url);
            return {
              timestamp: cfg.corp.timestamp,
              nonceStr: cfg.corp.nonceStr,
              signature: cfg.corp.signature,
            };
          },
          getAgentConfigSignature: async (url) => {
            const cfg = await fetchJsSdkConfig(url);
            return {
              timestamp: cfg.agent.timestamp,
              nonceStr: cfg.agent.nonceStr,
              signature: cfg.agent.signature,
            };
          },
          onAgentConfigFail: (err) => {
            // 定位/语音主要依赖企业 config；agentConfig 失败时仍尝试继续
            console.warn("[wecom] agentConfig failed", err);
          },
        });

        await ww.ensureConfigReady();

        ww.onVoiceRecordEnd((event) => {
          voiceEndHandlerRef.current?.(event.localId);
        });

        if (!cancelled) {
          setError(null);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setReady(false);
          setError(formatSdkError(e));
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const getLocation = useCallback(async () => {
    if (!ready) throw new Error("企业微信 SDK 未就绪");
    const res = await ww.getLocation({ type: ww.LocationType.gcj02 });
    return { latitude: res.latitude, longitude: res.longitude };
  }, [ready]);

  const stopVoiceRecord = useCallback(async () => {
    if (!ready) throw new Error("企业微信 SDK 未就绪");

    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const finish = (localId: string) => {
        if (settled) return;
        settled = true;
        voiceEndHandlerRef.current = null;
        void ww
          .translateVoice({ localId, isShowProgressTips: true })
          .then((r) => resolve(r.translateResult ?? ""))
          .catch(reject);
      };

      voiceEndHandlerRef.current = finish;

      void ww
        .stopRecord()
        .then((res) => finish(res.localId))
        .catch((err) => {
          if (settled) return;
          settled = true;
          voiceEndHandlerRef.current = null;
          reject(err);
        });
    });
  }, [ready]);

  const startVoiceRecord = useCallback(async () => {
    if (!ready) throw new Error("企业微信 SDK 未就绪");
    await ww.startRecord();
  }, [ready]);

  return {
    ready,
    error,
    getLocation,
    startVoiceRecord,
    stopVoiceRecord,
  };
}

export function isWeComClient() {
  if (typeof navigator === "undefined") return false;
  return /wxwork/i.test(navigator.userAgent);
}
