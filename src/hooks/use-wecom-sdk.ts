"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WECOM_JS_SDK_URL } from "@/lib/wecom/config";

type SdkConfig = {
  corpId: string;
  agentId: number;
  corp: { nonceStr: string; timestamp: number; signature: string };
  agent: { nonceStr: string; timestamp: number; signature: string };
};

type WeixinWindow = Window & {
  wx?: {
    config: (opts: Record<string, unknown>) => void;
    ready: (fn: () => void) => void;
    error: (fn: (err: unknown) => void) => void;
    agentConfig: (opts: Record<string, unknown>) => void;
    getLocation: (opts: {
      type: string;
      success: (res: { latitude: number; longitude: number }) => void;
      fail: (err: unknown) => void;
    }) => void;
    startRecord: (opts?: {
      success?: () => void;
      fail?: (err: unknown) => void;
    }) => void;
    stopRecord: (opts: {
      success: (res: { localId: string }) => void;
      fail: (err: unknown) => void;
    }) => void;
    onVoiceRecordEnd: (opts: { complete: (res: { localId: string }) => void }) => void;
    translateVoice: (opts: {
      localId: string;
      isShowProgressTips?: number;
      success: (res: { translateResult: string }) => void;
      fail: (err: unknown) => void;
    }) => void;
  };
};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("加载企业微信 JS-SDK 失败"));
    document.body.appendChild(script);
  });
}

function translateVoiceLocalId(wx: NonNullable<WeixinWindow["wx"]>, localId: string) {
  return new Promise<string>((resolve, reject) => {
    wx.translateVoice({
      localId,
      isShowProgressTips: 1,
      success: (r) => resolve(r.translateResult ?? ""),
      fail: reject,
    });
  });
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
        await loadScript(WECOM_JS_SDK_URL);
        const url = window.location.href.split("#")[0];
        const res = await fetch(`/api/wecom/js-sdk-config?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error("获取 JS-SDK 配置失败");
        const config = (await res.json()) as SdkConfig;
        const wx = (window as WeixinWindow).wx;
        if (!wx) throw new Error("wx 对象不可用");

        await new Promise<void>((resolve, reject) => {
          wx.config({
            beta: true,
            debug: false,
            appId: config.corpId,
            timestamp: config.corp.timestamp,
            nonceStr: config.corp.nonceStr,
            signature: config.corp.signature,
            jsApiList: [
              "getLocation",
              "startRecord",
              "stopRecord",
              "onVoiceRecordEnd",
              "translateVoice",
            ],
          });

          wx.ready(() => {
            wx.agentConfig({
              corpid: config.corpId,
              agentid: config.agentId,
              timestamp: config.agent.timestamp,
              nonceStr: config.agent.nonceStr,
              signature: config.agent.signature,
              jsApiList: [
                "getLocation",
                "startRecord",
                "stopRecord",
                "onVoiceRecordEnd",
                "translateVoice",
              ],
              success: () => resolve(),
              fail: (err: unknown) => reject(err),
            });
          });

          wx.error((err: unknown) => reject(err));
        });

        wx.onVoiceRecordEnd({
          complete: (res) => {
            voiceEndHandlerRef.current?.(res.localId);
          },
        });

        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "企业微信 JS-SDK 初始化失败");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const getLocation = useCallback(async () => {
    const wx = (window as WeixinWindow).wx;
    if (!wx || !ready) throw new Error("企业微信 SDK 未就绪");

    return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      wx.getLocation({
        type: "gcj02",
        success: resolve,
        fail: reject,
      });
    });
  }, [ready]);

  const stopVoiceRecord = useCallback(async () => {
    const wx = (window as WeixinWindow).wx;
    if (!wx || !ready) throw new Error("企业微信 SDK 未就绪");

    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const finish = (localId: string) => {
        if (settled) return;
        settled = true;
        voiceEndHandlerRef.current = null;
        translateVoiceLocalId(wx, localId).then(resolve).catch(reject);
      };

      voiceEndHandlerRef.current = finish;

      wx.stopRecord({
        success: (res) => finish(res.localId),
        fail: (err) => {
          if (settled) return;
          settled = true;
          voiceEndHandlerRef.current = null;
          reject(err);
        },
      });
    });
  }, [ready]);

  const startVoiceRecord = useCallback(() => {
    const wx = (window as WeixinWindow).wx;
    if (!wx || !ready) throw new Error("企业微信 SDK 未就绪");

    return new Promise<void>((resolve, reject) => {
      wx.startRecord({
        success: () => resolve(),
        fail: reject,
      });
    });
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
