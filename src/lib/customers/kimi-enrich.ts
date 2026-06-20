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
  province: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  hospitalLevel: z.enum(HOSPITAL_LEVELS).optional().nullable(),
  bedCount: z.coerce.number().int().positive().optional().nullable(),
  existingSystem: z.string().optional().nullable(),
  customerType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
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
    return `请根据公开信息，查找中国大陆医疗机构「${name}」的基本情况。${locationLine}

返回 JSON，字段说明：
- province, city, district: 所在省市区
- hospitalLevel: 医院等级，只能是 GRADE_3A|GRADE_3B|GRADE_3|GRADE_2A|GRADE_2B|GRADE_2|OTHER 之一，未知则 null
- bedCount: 床位数（整数），未知则 null
- existingSystem: 现有信息化/业务系统概况（简短）
- notes: 其他有用信息（登记号、地址、特色科室等）
- summary: 一句话摘要

只返回 JSON，不要 markdown。信息不确定的字段填 null，不要编造。`;
  }

  if (category === "COMPANY") {
    return `请根据公开工商信息，查找中国大陆企业「${name}」的基本登记信息。${locationLine}

返回 JSON，字段说明：
- province, city, district: 注册地省市区
- existingSystem: 主营业务/经营范围摘要（简短）
- notes: 统一社会信用代码、法定代表人、注册资本、成立日期等（能查到的写入此字段）
- summary: 一句话摘要

hospitalLevel、bedCount、customerType 填 null。
只返回 JSON，不要 markdown。信息不确定的字段填 null，不要编造。`;
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
      "你是企业/医疗机构信息检索助手。仅根据公开信息回答，不确定则返回 null。必须返回合法 JSON。",
    user: buildPrompt(name, input.category, input),
    maxTokens: 1024,
  });

  return enrichResultSchema.parse(raw);
}

export type { HospitalLevel };
