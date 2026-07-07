"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiAgentConfigView } from "@/lib/agent/config";
import { saveAiAgentConfig, testAiAgentConnection } from "@/app/(dashboard)/admin/settings/actions";
import {
  IntegrationStatusGrid,
  type IntegrationStatusTone,
} from "@/components/admin/integration-status-grid";

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
  const [llmTestLabel, setLlmTestLabel] = useState<string | null>(null);
  const [llmTestTone, setLlmTestTone] = useState<IntegrationStatusTone | null>(null);

  function llmStatus() {
    if (llmTestLabel && llmTestTone) {
      return { label: llmTestLabel, tone: llmTestTone };
    }
    if (initial.llmReady) {
      return { label: "已就绪", tone: "ready" as const };
    }
    if (initial.apiKeyConfigured && !initial.enabled) {
      return { label: "已配置但未启用", tone: "warning" as const };
    }
    return { label: "未配置 API Key", tone: "warning" as const };
  }

  function sttStatus() {
    if (initial.sttReady) {
      return { label: "已就绪", tone: "ready" as const };
    }
    return { label: "未配置语音识别 Key", tone: "warning" as const };
  }

  const llm = llmStatus();
  const stt = sttStatus();

  function handleSave(formData: FormData) {
    setMessage(null);
    setError(null);
    setLlmTestLabel(null);
    setLlmTestTone(null);
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
        setLlmTestLabel("连接成功");
        setLlmTestTone("ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "连接测试失败";
        setError(msg);
        setLlmTestLabel("连接失败");
        setLlmTestTone("error");
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

      <IntegrationStatusGrid
        items={[
          {
            title: "Kimi 对话",
            label: llm.label,
            tone: llm.tone,
            hint:
              llm.tone === "ready"
                ? undefined
                : initial.apiKeyConfigured && !initial.enabled
                  ? "勾选「启用 AI 助手」后销售日志对话才可用"
                  : "配置 Kimi API Key 后点击「测试连接」验证",
          },
          {
            title: "浏览器语音识别",
            label: stt.label,
            tone: stt.tone,
            hint: stt.tone === "ready" ? undefined : "推荐硅基流动 SenseVoice，用于 /mobile/log 麦克风输入",
          },
        ]}
      />

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
          <p className="text-sm font-medium">浏览器语音输入（SenseVoice）</p>
          <p className="text-xs text-muted-foreground">
            浏览器内语音转文字需单独配置语音识别 API（推荐{" "}
            <a
              href="https://cloud.siliconflow.cn"
              className="text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              硅基流动
            </a>
            ）。Chrome 内置 Web Speech 在国内无法使用，请勿依赖浏览器原生识别。
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sttApiKey">语音识别 API Key</Label>
              <Input
                id="sttApiKey"
                name="sttApiKey"
                type="password"
                autoComplete="off"
                placeholder={initial.sttApiKeyConfigured ? "留空则保持现有密钥" : "sk-..."}
              />
              <p className="text-xs text-muted-foreground">{initial.sttApiKeyMask}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sttApiBase">语音识别 API Base</Label>
              <Input
                id="sttApiBase"
                name="sttApiBase"
                defaultValue={initial.sttApiBase}
                placeholder="https://api.siliconflow.cn/v1"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sttModel">语音识别模型</Label>
              <Input
                id="sttModel"
                name="sttModel"
                defaultValue={initial.sttModel}
                placeholder="FunAudioLLM/SenseVoiceSmall"
                required
              />
            </div>
          </div>
        </div>

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
