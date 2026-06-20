import { z } from "zod";
import { callKimiJson } from "@/lib/customers/kimi-client";
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
});

export type CustomerEnrichResult = z.infer<typeof enrichResultSchema>;

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
  const locationLine = locationHint ? `\n已知定位线索：${locationHint}` : "";

  if (category === "HOSPITAL") {
    return `用户输入的医疗机构名称：「${name}」${locationLine}

请查找该机构在卫健系统或公开信息中的常用**官方全称**（例如「南京第三医院」应对应为「南京市第三人民医院」），并补充基本信息。

返回 JSON，字段说明：
- officialName: 官方常用全称；若与用户输入为同一机构但简称/缺字，返回完整官方名称；若输入已准确则返回相同文字
- province, city, district: 所在省、市、区/县
- hospitalLevel: 医院等级，只能是 GRADE_3A|GRADE_3B|GRADE_3|GRADE_2A|GRADE_2B|GRADE_2|OTHER 之一，未知则 null
- bedCount: 开放床位数（整数），未知则 null

只返回以上字段，不要返回备注、简介、现有系统等。不确定填 null，不要编造。`;
  }

  if (category === "COMPANY") {
    return `用户输入的企业名称：「${name}」${locationLine}

请查找该企业在工商登记中的**官方全称**，并补充注册地址。

返回 JSON，字段说明：
- officialName: 工商登记全称；若与用户输入为同一主体但表述不完整，返回完整名称；若输入已准确则返回相同文字
- province, city, district: 注册地省、市、区/县

hospitalLevel、bedCount 填 null。
只返回以上字段，不要返回备注、经营范围等。不确定填 null，不要编造。`;
  }

  throw new Error("个人客户不支持 Kimi 信息检索");
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
      "你是医疗机构/企业名称核对助手。优先返回官方全称，并补充地址与医院等级、床位数。仅返回 JSON，不确定则 null。",
    user: buildPrompt(name, input.category, input),
    maxTokens: 1024,
  });

  return enrichResultSchema.parse(raw);
}

export type { HospitalLevel };
