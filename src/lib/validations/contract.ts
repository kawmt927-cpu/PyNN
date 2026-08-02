import { z } from "zod";

const money = z.coerce.number().finite();

export const externalCostInstallmentLineSchema = z.object({
  periodNumber: z.coerce.number().int().positive("期次须为正整数"),
  amount: money.positive("计划金额须大于 0"),
  condition: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

export const contractProductLineSchema = z
  .object({
    productServiceId: z.string().optional().nullable(),
    productName: z.string().min(1, "请选择产品名称"),
    description: z.string().optional().nullable(),
    costType: z.enum(["INTERNAL", "EXTERNAL"]).default("INTERNAL"),
    costAmount: money.min(0, "成本不能为负"),
    externalInstallments: z.array(externalCostInstallmentLineSchema).optional().default([]),
  })
  .superRefine((row, ctx) => {
    if (row.costType !== "EXTERNAL") return;
    if (!row.externalInstallments.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `外部成本「${row.productName}」请添加付款分期`,
        path: ["externalInstallments"],
      });
      return;
    }
    const coverageError = validateInstallmentCoverage(row.costAmount, row.externalInstallments);
    if (coverageError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `外部成本「${row.productName}」：${coverageError.replace("回款计划", "付款计划").replace("合同金额", "应付总额")}`,
        path: ["externalInstallments"],
      });
    }
    const periodNumbers = row.externalInstallments.map((item) => item.periodNumber);
    if (new Set(periodNumbers).size !== periodNumbers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `外部成本「${row.productName}」付款期次不能重复`,
        path: ["externalInstallments"],
      });
    }
  });

export const contractInstallmentLineSchema = z.object({
  periodNumber: z.coerce.number().int().positive("期次须为正整数"),
  amount: money.positive("计划金额须大于 0"),
  condition: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

export function validateInstallmentCoverage(
  totalAmount: number,
  installments: Array<{ amount: number }>
): string | null {
  const installmentSum = installments.reduce((sum, row) => sum + row.amount, 0);
  const gap = totalAmount - installmentSum;
  if (Math.abs(gap) <= 0.01) return null;
  if (gap > 0.01) {
    return `回款计划还差 ${gap.toFixed(2)} 元未覆盖合同金额（${totalAmount.toFixed(2)} 元），请继续添加期次或调大计划金额`;
  }
  return `回款计划合计超出合同金额 ${Math.abs(gap).toFixed(2)} 元，请调整各期计划金额`;
}

export const contractFormSchema = z
  .object({
    title: z.string().min(1, "请输入合同标题"),
    totalAmount: money.positive("合同金额须大于 0"),
    signingType: z.enum(["DIRECT", "INDIRECT"]),
    signCustomerId: z.string().min(1, "请选择签约客户"),
    endUserCustomerId: z.string().min(1, "请选择最终用户"),
    signContactId: z.string().min(1, "请选择对方代表（客户联系人）"),
    ourRepresentativeId: z.string().min(1, "请选择我方代表"),
    paymentMethod: z.string().optional().nullable(),
    ownerId: z.string().optional().nullable(),
    opportunityId: z.string().optional().nullable(),
    signedAt: z.string().min(1, "请选择签约日期"),
    effectiveAt: z.string().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    notes: z.string().optional(),
    products: z.array(contractProductLineSchema).min(1, "请至少添加一行签约产品"),
    installments: z.array(contractInstallmentLineSchema).min(1, "请至少添加一期回款计划"),
  })
  .superRefine((data, ctx) => {
    if (data.signingType === "DIRECT") {
      if (data.signCustomerId !== data.endUserCustomerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "直签时签约客户与最终用户必须为同一客户",
          path: ["endUserCustomerId"],
        });
      }
    } else if (data.signCustomerId === data.endUserCustomerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "非直签时签约客户与最终用户不能相同",
        path: ["endUserCustomerId"],
      });
    }

    const coverageError = validateInstallmentCoverage(data.totalAmount, data.installments);
    if (coverageError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: coverageError,
        path: ["installments"],
      });
    }
    const periodNumbers = data.installments.map((row) => row.periodNumber);
    if (new Set(periodNumbers).size !== periodNumbers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "回款期次不能重复",
        path: ["installments"],
      });
    }
  });

export const contractPaymentRecordSchema = z.object({
  contractId: z.string().min(1),
  amount: money.positive("回款金额须大于 0"),
  paidAt: z.string().min(1, "请选择回款日期"),
  notes: z.string().optional(),
});

export const contractInvoiceRecordSchema = z.object({
  contractId: z.string().min(1),
  amount: money.positive("开票金额须大于 0"),
  taxRatePercent: z.coerce
    .number({ invalid_type_error: "请填写税率" })
    .min(0, "税率不能为负")
    .max(100, "税率不能超过 100"),
  invoicedAt: z.string().min(1, "请选择开票日期"),
  invoiceNo: z.string().optional(),
  notes: z.string().optional(),
});

export const externalCostPayoutRecordSchema = z.object({
  contractProductId: z.string().min(1),
  amount: money.positive("实付金额须大于 0"),
  paidAt: z.string().min(1, "请选择付款日期"),
  notes: z.string().optional(),
});

export const externalCostInstallmentsUpdateSchema = z
  .object({
    contractProductId: z.string().min(1),
    costAmount: money.min(0, "应付总额不能为负"),
    installments: z.array(externalCostInstallmentLineSchema).min(1, "请至少添加一期付款计划"),
  })
  .superRefine((data, ctx) => {
    const coverageError = validateInstallmentCoverage(data.costAmount, data.installments);
    if (coverageError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: coverageError
          .replace("回款计划", "付款计划")
          .replace("合同金额", "应付总额"),
        path: ["installments"],
      });
    }
    const periodNumbers = data.installments.map((row) => row.periodNumber);
    if (new Set(periodNumbers).size !== periodNumbers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "付款期次不能重复",
        path: ["installments"],
      });
    }
  });

export const contractRejectSchema = z.object({
  contractId: z.string().min(1),
  rejectReason: z.string().min(1, "请填写驳回原因"),
});
