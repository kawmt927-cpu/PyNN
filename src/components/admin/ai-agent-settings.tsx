"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiAgentConfigView } from "@/lib/agent/config";
import { saveAiAgentConfig, testAiAgentConnection } from "@/app/(dashboard)/admin/settings/actions";

type Props = {
  initial: AiAgentConfigView;
};

function CheckboxField({
  id,
  name,
  label,
  description,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-input"
      />
      <div className="space-y-1">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function AiAgentSettings({ initial }: Props) {
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
        await saveAiAgentConfig(formData);
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
        const result = await testAiAgentConnection(formData);
        setMessage(result.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "连接测试失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
        <p className="font-medium">Kimi Agent（工具调用模式）</p>
        <p className="mt-1 text-blue-800 dark:text-blue-200">
          使用 Kimi Chat API + 多步工具调用，可自动查询 CRM 客户、商机与跟进记录。API Key
          保存在数据库中，环境变量 <code className="rounded bg-white/60 px-1">LLM_API_KEY</code>{" "}
          仅作未配置时的兜底。
        </p>
      </div>

      <form ref={formRef} action={handleSave} id="ai-agent-form" className="space-y-6">
        <CheckboxField
          id="enabled"
          name="enabled"
          label="启用 AI 助手"
          description="关闭后销售日志对话将不可用"
          defaultChecked={initial.enabled}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="apiKey">Kimi API Key</Label>
            <Input
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder={initial.apiKeyConfigured ? "留空则保持现有密钥" : "sk-..."}
            />
            <p className="text-xs text-muted-foreground">{initial.apiKeyMask}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiBase">API Base</Label>
            <Input
              id="apiBase"
              name="apiBase"
              defaultValue={initial.apiBase}
              placeholder="https://api.moonshot.cn/v1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">模型</Label>
            <Input
              id="model"
              name="model"
              defaultValue={initial.model}
              placeholder="kimi-k2.5"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxSteps">最大工具步数</Label>
            <Input
              id="maxSteps"
              name="maxSteps"
              type="number"
              min={1}
              max={20}
              defaultValue={initial.maxSteps}
              required
            />
          </div>
        </div>

        <CheckboxField
          id="thinkingEnabled"
          name="thinkingEnabled"
          label="启用思考模式（K2 系列）"
          description="默认关闭。开启后模型会先推理再回答，当前对话界面可能无可见回复，建议保持关闭"
          defaultChecked={initial.thinkingEnabled}
        />

        <p className="text-sm text-muted-foreground">
          销售日志系统提示词请在{" "}
          <a href="/admin/settings?tab=sales-log" className="font-medium text-primary underline">
            日志助手
          </a>{" "}
          标签页中查看与修改。
        </p>

        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">Agent 工具</p>
          <div className="grid gap-3 md:grid-cols-2">
            <CheckboxField
              id="toolSearchCustomers"
              name="toolSearchCustomers"
              label="搜索客户"
              defaultChecked={initial.toolSearchCustomers}
            />
            <CheckboxField
              id="toolSearchOpportunities"
              name="toolSearchOpportunities"
              label="搜索商机"
              defaultChecked={initial.toolSearchOpportunities}
            />
            <CheckboxField
              id="toolGetCustomer"
              name="toolGetCustomer"
              label="获取客户详情"
              defaultChecked={initial.toolGetCustomer}
            />
            <CheckboxField
              id="toolListFollowUps"
              name="toolListFollowUps"
              label="列出客户跟进记录"
              defaultChecked={initial.toolListFollowUps}
            />
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
            {isTesting ? "测试中…" : "测试连接"}
          </Button>
        </div>
      </form>
    </div>
  );
}
