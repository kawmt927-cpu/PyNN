import { z } from "zod";
import { callKimiJson } from "@/lib/customers/kimi-client";
import { normalizeOrgName, scoreNameMatch } from "@/lib/search/fuzzy-text";
import type { CustomerCategory, HospitalLevel } from "@prisma/client";

const HOSPITAL_LEVELS = [
  "GRADE_3A",
  "GRADE_3B",
  "GRADE_3",
  "GRADE_2A",
  "GRADE_2B",
  "GRADE_2",
  "OTHER",
] as const;

const enrichResultSchema = z.object({
  officialName: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  hospitalLevel: z.enum(HOSPITAL_LEVELS).optional().nullable(),
  bedCount: z.coerce.number().int().positive().optional().nullable(),
  /** 模型自报：是否与用户输入为同一机构 */
  sameEntity: z.boolean().optional().nullable(),
  /** 模型自报：匹配置信度 0–1 */
  confidence: z.coerce.number().min(0).max(1).optional().nullable(),
});

export type CustomerEnrichResult = z.infer<typeof enrichResultSchema>;

/** 去掉医院/公司等通用后缀，取可区分核心词 */
export function orgNameCore(name: string): string {
  return normalizeOrgName(name).replace(
    /(医院|卫生院|卫生服务中心|有限责任公司|有限公司|股份公司|集团公司|集团|公司)+$/g,
    ""
  );
}

/**
 * 判断官方全称是否仍指向用户输入的同一机构。
 * 防止模型在定位线索干扰下返回无关医院/公司。
 */
export function isLikelySameOrganization(inputName: string, officialName: string): boolean {
  const input = inputName.trim();
  const official = officialName.trim();
  if (!input || !official) return false;

  const score = scoreNameMatch(input, official);
  if (score >= 90) return true;

  const core = orgNameCore(input);
  if (core.length >= 2 && normalizeOrgName(official).includes(core)) {
    return true;
  }

  // 官方名是输入的超集（仅多了市/区等），且核心重叠
  if (score >= 80 && core.length >= 2) return true;

  return false;
}

function buildPrompt(
  name: string,
  category: CustomerCategory,
  hints?: {
    province?: string;
    city?: string;
    district?: string;
  }
) {
  const locationHint = [hints?.province, hints?.city, hints?.district].filter(Boolean).join("");
  const locationBlock = locationHint
    ? `

【定位线索】${locationHint}
说明：该线索仅用于在「同名机构」之间消歧（例如多地都有「市人民医院」「协和」时，优先匹配该省市的那一家）。
严禁：因为定位在某地，就改成与用户输入名称无关的本地其他医院/公司。`
    : "";

  if (category === "HOSPITAL") {
    return `用户输入的医疗机构名称：「${name}」${locationBlock}

任务：核对**同一家**医疗机构的官方常用全称，并补充该机构自身的基本信息。

硬性规则：
1. officialName 必须与用户输入指向同一机构（允许补全市/区、人民、第×等字），禁止换成别的医院
2. 若名称歧义大（如仅「协和医院」）且定位线索也无法唯一确定：返回全国最广为人知的官方全称（北京协和医院），或 officialName=null；不要随便填本地无关医院
3. province/city/district/hospitalLevel/bedCount 必须属于 officialName 对应的那家机构；不确定填 null，禁止编造
4. sameEntity：是否与用户输入为同一机构（true/false）
5. confidence：0~1，把握不足时降低

返回 JSON 字段：
- officialName, province, city, district
- hospitalLevel: GRADE_3A|GRADE_3B|GRADE_3|GRADE_2A|GRADE_2B|GRADE_2|OTHER 或 null
- bedCount: 整数或 null
- sameEntity: boolean
- confidence: number

只返回 JSON。`;
  }

  if (category === "COMPANY") {
    return `用户输入的企业名称：「${name}」${locationBlock}

任务：核对**同一家**企业的工商登记全称，并补充注册地址。

硬性规则：
1. officialName 必须与用户输入指向同一主体，禁止换成无关公司
2. 定位线索仅用于同名消歧，不能用来替换成别的企业
3. 不确定则字段填 null；sameEntity/confidence 如实填写

返回 JSON：officialName, province, city, district, hospitalLevel=null, bedCount=null, sameEntity, confidence
只返回 JSON。`;
  }

  throw new Error("个人客户不支持 Kimi 信息检索");
}

function assertEnrichMatchesInput(
  inputName: string,
  result: CustomerEnrichResult
): CustomerEnrichResult {
  const official = result.officialName?.trim() || "";

  if (!official) {
    throw new Error(
      `未能唯一确认「${inputName}」对应的机构（同名较多或与当前定位不一致）。请填写更完整的官方名称后再试，例如「北京协和医院」「华中科技大学同济医学院附属协和医院」`
    );
  }

  const sameByModel = result.sameEntity !== false;
  const sameByName = isLikelySameOrganization(inputName, official);
  const confidenceOk = result.confidence == null || result.confidence >= 0.55;

  if (!sameByName || !sameByModel || !confidenceOk) {
    throw new Error(
      `Kimi 返回的「${official}」与输入「${inputName}」不像同一机构，已拒绝自动填充。请改用更完整的官方名称后再试`
    );
  }

  return result;
}

export async function enrichCustomerWithKimi(input: {
  name: string;
  category: CustomerCategory;
  province?: string;
  city?: string;
  district?: string;
}): Promise<CustomerEnrichResult> {
  const name = input.name.trim();
  if (!name) throw new Error("请先填写客户名称");

  if (input.category !== "HOSPITAL" && input.category !== "COMPANY") {
    throw new Error("仅医院或公司客户支持 Kimi 信息检索");
  }

  const raw = await callKimiJson({
    system:
      "你是医疗机构/企业名称核对助手。必须返回与用户输入同一机构的官方信息；禁止因定位线索替换成无关机构。仅返回 JSON。",
    user: buildPrompt(name, input.category, input),
    maxTokens: 1024,
  });

  const parsed = enrichResultSchema.parse(raw);
  return assertEnrichMatchesInput(name, parsed);
}

export type { HospitalLevel };
