import type { CustomerCategory, HospitalLevel } from "@prisma/client";

export type KimiEnrichApplyPayload = {
  officialName?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  hospitalLevel?: string | null;
  bedCount?: unknown;
};

export type KimiEnrichApplyResult = {
  hints: string;
  nameCorrected: boolean;
};

export function canUseCustomerKimiEnrich(category: CustomerCategory) {
  return category === "HOSPITAL" || category === "COMPANY";
}

export async function fetchCustomerKimiEnrich(input: {
  name: string;
  category: CustomerCategory;
  province?: string;
  city?: string;
  district?: string;
}): Promise<KimiEnrichApplyPayload> {
  const res = await fetch("/api/customers/enrich", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as KimiEnrichApplyPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Kimi 检索失败");
  }
  return data;
}

export function applyCustomerKimiEnrich(
  data: KimiEnrichApplyPayload,
  input: {
    name: string;
    category: CustomerCategory;
    setName: (value: string) => void;
    setProvince: (value: string) => void;
    setCity: (value: string) => void;
    setDistrict: (value: string) => void;
    setHospitalLevel?: (value: HospitalLevel | "") => void;
    setBedCount?: (value: string) => void;
  }
): KimiEnrichApplyResult {
  const inputName = input.name.trim();
  const officialName = typeof data.officialName === "string" ? data.officialName.trim() : "";
  const hints: string[] = [];
  let nameCorrected = false;

  if (officialName && officialName !== inputName) {
    input.setName(officialName);
    nameCorrected = true;
    hints.push(`名称已更正为官方全称：「${officialName}」（原输入：「${inputName}」）`);
  } else if (officialName) {
    hints.push("名称与官方全称一致");
  }

  if (typeof data.province === "string" && data.province) input.setProvince(data.province);
  if (typeof data.city === "string" && data.city) input.setCity(data.city);
  if (typeof data.district === "string" && data.district) input.setDistrict(data.district);

  if (input.category === "HOSPITAL") {
    if (typeof data.hospitalLevel === "string" && data.hospitalLevel && input.setHospitalLevel) {
      input.setHospitalLevel(data.hospitalLevel as HospitalLevel);
    }
    if (data.bedCount != null && data.bedCount !== "" && input.setBedCount) {
      input.setBedCount(String(data.bedCount));
    }
    if (hints.length === 0) {
      hints.push("已填充医院等级、床位数与地址");
    } else {
      hints.push("已同步填充等级、床位数与地址");
    }
  } else if (hints.length === 0) {
    hints.push("已填充注册地址");
  } else {
    hints.push("已同步填充注册地址");
  }

  return {
    hints: hints.join("；") + "，请核对后保存",
    nameCorrected,
  };
}
