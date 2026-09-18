/**
 * 粗判名称是否像医院/公司等机构（用于拦截「把机构建成个人客户」）。
 * 不替代人工确认；宁可漏拦，也不要把纯人名误判成机构。
 */
const ORG_NAME_PATTERN =
  /医院|卫生院|卫生服务|诊所|门诊|医学院|大学|学院|公司|集团|有限|股份|事务所|中心(?!医院)|银行|电信|移动|联通|运营商|集成|科技|信息|软件|厂商|渠道|药房|药店|卫健|医保|疾控/;

export function looksLikeOrganizationName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  return ORG_NAME_PATTERN.test(trimmed);
}

/** 粗判是否像自然人姓名（极短、无机构关键词） */
export function looksLikePersonName(name: string): boolean {
  const trimmed = name.trim().replace(/\s+/g, "");
  if (trimmed.length < 2 || trimmed.length > 4) return false;
  if (looksLikeOrganizationName(trimmed)) return false;
  // 排除明显非人名片段
  if (/[0-9a-zA-Z]/.test(trimmed)) return false;
  return true;
}
