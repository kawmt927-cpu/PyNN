"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SalesLogPromptSettingsView } from "@/lib/agent/config";
import { saveSalesLogPrompt } from "@/app/(dashboard)/admin/settings/actions";

type Props = {
  initial: SalesLogPromptSettingsView;
  showAiSettingsLink?: boolean;
};

export function SalesLogPromptSettings({ initial, showAiSettingsLink }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [prompt, setPrompt] = useState(initial.effectivePrompt);
  const [usingDefault, setUsingDefault] = useState(initial.usingDefault);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave(formData: FormData) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await saveSalesLogPrompt(formData);
        const trimmed = prompt.trim();
        const isDefault =
          trimmed === "" || trimmed === initial.defaultPrompt.trim();
        setUsingDefault(isDefault);
        setMessage(isDefault ? "已恢复为系统默认提示词" : "日志助手提示词已保存");
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    });
  }

  function handleRestoreDefault() {
    setPrompt(initial.defaultPrompt);
    setUsingDefault(true);
    setMessage(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <p className="font-medium">销售日志 AI 助理 · 系统提示词</p>
        <p className="mt-1 text-emerald-800 dark:text-emerald-200">
          控制 <code className="rounded bg-white/60 px-1">/mobile/log</code>{" "}
          与 PC「今日日报」对话中 AI 的角色、追问策略与工具使用规范。每次对话时，系统还会在提示词末尾自动追加
          <strong> 当日工作快照</strong>（打卡、往来等），无需在此重复编写。
        </p>
        <p className="mt-2 text-emerald-800 dark:text-emerald-200">
          代码里的默认提示词随发版更新；若本页为「已自定义」，线上不会自动吃到新默认，需手动粘贴同步或点「恢复默认」。
        </p>
        {showAiSettingsLink ? (
          <p className="mt-2 text-emerald-800 dark:text-emerald-200">
            API Key、模型与工具开关请前往{" "}
            <Link href="/admin/settings?tab=ai" className="font-medium underline">
              AI 助手
            </Link>{" "}
            配置。
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">当前状态：</span>
        {usingDefault ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">系统默认</span>
        ) : (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
            已自定义
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          共 {prompt.length.toLocaleString()} 字符
        </span>
      </div>

      <form ref={formRef} action={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="salesLogSystemPrompt">系统提示词（System Prompt）</Label>
          <Textarea
            id="salesLogSystemPrompt"
            name="salesLogSystemPrompt"
            rows={22}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setUsingDefault(e.target.value.trim() === initial.defaultPrompt.trim());
            }}
            className="font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            修改后点击保存即生效。若内容与内置默认完全一致，将自动视为使用默认版本。
          </p>
        </div>

        {message ? <p className="text-sm text-green-600">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "保存中…" : "保存提示词"}
          </Button>
          <Button type="button" variant="outline" disabled={isPending} onClick={handleRestoreDefault}>
            恢复默认
          </Button>
        </div>
      </form>
    </div>
  );
}
