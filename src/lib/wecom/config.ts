export type WeComConfigView = {
  corpIdConfigured: boolean;
  agentIdConfigured: boolean;
  secretConfigured: boolean;
  nextAuthUrlConfigured: boolean;
  /** 企微应用凭据（CorpId / AgentId / Secret） */
  credsReady: boolean;
  /** OAuth 扫码登录（凭据 + NEXTAUTH_URL） */
  oauthReady: boolean;
  /** 企微内 H5 JS-SDK（定位/语音，依赖凭据） */
  jsSdkReady: boolean;
};

export function getWeComConfigForAdmin(): WeComConfigView {
  const corpIdConfigured = Boolean(process.env.WECOM_CORP_ID?.trim());
  const agentIdConfigured = Boolean(process.env.WECOM_AGENT_ID?.trim());
  const secretConfigured = Boolean(process.env.WECOM_SECRET?.trim());
  const nextAuthUrlConfigured = Boolean(process.env.NEXTAUTH_URL?.trim());
  const credsReady = corpIdConfigured && agentIdConfigured && secretConfigured;

  return {
    corpIdConfigured,
    agentIdConfigured,
    secretConfigured,
    nextAuthUrlConfigured,
    credsReady,
    oauthReady: credsReady && nextAuthUrlConfigured,
    jsSdkReady: credsReady,
  };
}

export function isWeComConfigured() {
  return Boolean(
    process.env.WECOM_CORP_ID &&
      process.env.WECOM_AGENT_ID &&
      process.env.WECOM_SECRET
  );
}

export function getWeComConfig() {
  const corpId = process.env.WECOM_CORP_ID;
  const agentId = process.env.WECOM_AGENT_ID;
  const secret = process.env.WECOM_SECRET;

  if (!corpId || !agentId || !secret) {
    throw new Error("企业微信未配置，请设置 WECOM_CORP_ID、WECOM_AGENT_ID、WECOM_SECRET");
  }

  return { corpId, agentId: Number(agentId), secret };
}

export function isWeComUserAgent(userAgent: string) {
  return /wxwork/i.test(userAgent);
}

export const WECOM_OAUTH_SCOPE = "snsapi_base";

export const WECOM_JS_SDK_URL =
  "https://res.wx.qq.com/open/js/jweixin-1.2.0.js";

export { WECOM_WWLOGIN_SCRIPT_URL } from "./oauth-flow";
