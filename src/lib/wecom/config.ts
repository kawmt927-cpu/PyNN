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
