import type { WeComConfigView } from "@/lib/wecom/config";
import { IntegrationStatusGrid, integrationTone } from "@/components/admin/integration-status-grid";

type Props = {
  config: WeComConfigView;
};

function missingCredsHint(config: WeComConfigView): string | undefined {
  if (config.credsReady) return undefined;
  const missing: string[] = [];
  if (!config.corpIdConfigured) missing.push("WECOM_CORP_ID");
  if (!config.agentIdConfigured) missing.push("WECOM_AGENT_ID");
  if (!config.secretConfigured) missing.push("WECOM_SECRET");
  return `请在环境变量中配置：${missing.join("、")}`;
}

export function WeComIntegrationOverview({ config }: Props) {
  return (
    <IntegrationStatusGrid
      columns={3}
      items={[
        {
          title: "应用凭据",
          label: config.credsReady ? "已就绪" : "未配置完整凭据",
          tone: integrationTone(config.credsReady),
          hint: missingCredsHint(config),
        },
        {
          title: "OAuth 登录",
          label: config.oauthReady
            ? "已就绪"
            : config.credsReady
              ? "缺少 NEXTAUTH_URL"
              : "需先配置应用凭据",
          tone: integrationTone(config.oauthReady),
          hint: config.credsReady && !config.nextAuthUrlConfigured
            ? "扫码登录需设置 NEXTAUTH_URL 为对外可访问的 CRM 地址"
            : undefined,
        },
        {
          title: "JS-SDK（定位/语音）",
          label: config.jsSdkReady ? "已就绪" : "需先配置应用凭据",
          tone: integrationTone(config.jsSdkReady),
          hint: config.jsSdkReady
            ? "企微内打开销售日志时用于定位与语音转写"
            : undefined,
        },
      ]}
    />
  );
}
