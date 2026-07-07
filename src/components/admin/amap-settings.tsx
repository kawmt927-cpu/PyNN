"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AmapConfigView } from "@/lib/amap/config";
import { saveAmapConfig, testAmapConnection } from "@/app/(dashboard)/admin/settings/actions";
import { IntegrationStatusGrid, integrationTone } from "@/components/admin/integration-status-grid";

type Props = {
  initial: AmapConfigView;
};

export function AmapSettings({ initial }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isTesting, startTestTransition] = useTransition();

  function handleSave(formData: FormData) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await saveAmapConfig(formData);
        setMessage("配置已保存");
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    });
  }

  function handleTest(formData: FormData) {
    setMessage(null);
    setError(null);
    startTestTransition(async () => {
      try {
        const result = await testAmapConnection(formData);
        setMessage(result.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "连接测试失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
        <p className="font-medium">外勤打卡 · 高德地图</p>
        <p className="mt-1 text-blue-800 dark:text-blue-200">
          销售在「外勤日志」打卡时，系统获取 GPS 后通过高德逆地理编码解析省、市、区县、街道门牌，并在页面展示地图。
          Key 保存在数据库中；环境变量{" "}
          <code className="rounded bg-white/60 px-1">AMAP_WEB_SERVICE_KEY</code> /{" "}
          <code className="rounded bg-white/60 px-1">NEXT_PUBLIC_AMAP_WEB_KEY</code>{" "}
          仅作未配置时的兜底。
        </p>
        <p className="mt-2 text-blue-800 dark:text-blue-200">
          申请地址：{" "}
          <a
            href="https://lbs.amap.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            高德开放平台
          </a>
          （需创建应用并分别开启「Web 服务」与「Web 端 JS API」）
        </p>
      </div>

      <IntegrationStatusGrid
        items={[
          {
            title: "地址解析",
            label: initial.geocodeReady ? "已就绪" : "未配置 Web 服务 Key",
            tone: integrationTone(initial.geocodeReady),
          },
          {
            title: "地图展示",
            label: initial.mapReady ? "已就绪" : "未配置 JS API Key",
            tone: integrationTone(initial.mapReady),
            hint: initial.mapReady
              ? undefined
              : "未配置时仍可解析地址，但打卡页不显示地图。",
          },
        ]}
      />

      <form ref={formRef} action={handleSave} id="amap-form" className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="webServiceKey">Web 服务 Key（逆地理编码）</Label>
            <Input
              id="webServiceKey"
              name="webServiceKey"
              type="password"
              autoComplete="off"
              placeholder={initial.webServiceKeyConfigured ? "留空则保持现有密钥" : "服务端 Key，勿泄露"}
            />
            <p className="text-xs text-muted-foreground">{initial.webServiceKeyMask}</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>控制台开启「Web 服务」</li>
              <li>用于 GPS → 省市区街道门牌，仅在服务端调用</li>
              <li>与 JS API Key 可相同，也可分别创建</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jsKey">JS API Key（地图展示）</Label>
            <Input
              id="jsKey"
              name="jsKey"
              type="password"
              autoComplete="off"
              placeholder={initial.jsKeyConfigured ? "留空则保持现有密钥" : "浏览器端 Key"}
            />
            <p className="text-xs text-muted-foreground">{initial.jsKeyMask}</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>控制台开启「Web 端 (JS API)」</li>
              <li>配置域名白名单（本地开发加 localhost，生产加 CRM 域名）</li>
              <li>用于外勤打卡页内嵌地图与标记点</li>
            </ul>
          </div>
        </div>

        {message ? <p className="text-sm text-green-600">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "保存中…" : "保存配置"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isTesting}
            onClick={() => {
              if (!formRef.current) return;
              handleTest(new FormData(formRef.current));
            }}
          >
            {isTesting ? "测试中…" : "测试地址解析"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/sales-log">前往外勤日志</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
