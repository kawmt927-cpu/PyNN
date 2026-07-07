import { z } from "zod";
import { SalesCostType } from "@prisma/client";

const money = z.coerce.number().min(0, "金额不能为负");
const positiveMoney = z.coerce.number().positive("金额须大于 0");
const optionalNote = z.string().optional();

const travelNoteFields = {
  accommodationNote: optionalNote,
  transportationNote: optionalNote,
  mealsNote: optionalNote,
  otherTravelNote: optionalNote,
};

const travelAmountFields = {
  accommodation: money.optional(),
  transportation: money.optional(),
  meals: money.optional(),
  otherTravel: money.optional(),
};

const baseFields = {
  salesUserId: z.string().min(1, "请选择销售"),
  costDate: z.string().min(1, "请选择费用日期"),
};

export const personalTravelCostSchema = z.object({
  ...baseFields,
  costType: z.literal(SalesCostType.PERSONAL_TRAVEL),
  ...travelAmountFields,
  ...travelNoteFields,
});

export const presalesCostSchema = z.object({
  ...baseFields,
  costType: z.literal(SalesCostType.PRESALES),
  presalesUserId: z.string().min(1, "请选择售前人员"),
  presalesDays: z.coerce.number().int().positive("售前天数须大于 0"),
  ...travelAmountFields,
  ...travelNoteFields,
});

export const businessCostSchema = z.object({
  ...baseFields,
  costType: z.literal(SalesCostType.BUSINESS),
  customerId: z.string().min(1, "请选择客户"),
  totalAmount: positiveMoney,
  description: z.string().optional(),
});

export const salesCostFormSchema = z.discriminatedUnion("costType", [
  personalTravelCostSchema,
  presalesCostSchema,
  businessCostSchema,
]);

export type SalesCostFormInput = z.infer<typeof salesCostFormSchema>;

function readFormNumber(formData: FormData, key: string): number {
  const raw = formData.get(key);
  if (raw == null || raw === "") return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function readFormOptionalText(formData: FormData, key: string): string | undefined {
  const value = (formData.get(key) as string | null)?.trim();
  return value || undefined;
}

function readTravelFromForm(formData: FormData) {
  return {
    accommodation: readFormNumber(formData, "accommodation"),
    transportation: readFormNumber(formData, "transportation"),
    meals: readFormNumber(formData, "meals"),
    otherTravel: readFormNumber(formData, "otherTravel"),
    accommodationNote: readFormOptionalText(formData, "accommodationNote"),
    transportationNote: readFormOptionalText(formData, "transportationNote"),
    mealsNote: readFormOptionalText(formData, "mealsNote"),
    otherTravelNote: readFormOptionalText(formData, "otherTravelNote"),
  };
}

export function parseSalesCostFormData(formData: FormData): SalesCostFormInput {
  const costType = formData.get("costType") as SalesCostType;
  const common = {
    salesUserId: formData.get("salesUserId"),
    costDate: formData.get("costDate"),
    costType,
  };

  if (costType === SalesCostType.BUSINESS) {
    return businessCostSchema.parse({
      ...common,
      customerId: formData.get("customerId"),
      totalAmount: formData.get("totalAmount"),
      description: readFormOptionalText(formData, "description"),
    });
  }

  const travel = readTravelFromForm(formData);

  if (costType === SalesCostType.PRESALES) {
    return presalesCostSchema.parse({
      ...common,
      presalesUserId: formData.get("presalesUserId"),
      presalesDays: formData.get("presalesDays"),
      ...travel,
    });
  }

  return personalTravelCostSchema.parse({
    ...common,
    ...travel,
  });
}
