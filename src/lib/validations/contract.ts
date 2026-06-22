import { z } from "zod";

const money = z.coerce.number().finite();

export const contractProductLineSchema = z.object({
  productServiceId: z.string().optional().nullable(),
  productName: z.string().min(1, "请填写产品名称"),
  costAmount: money.min(0, "成本不能为负"),
});

export const contractInstallmentLineSchema = z.object({
  periodNumber: z.coerce.number().int().positive("期次须为正整数"),
  amount: money.positive("计划金额须大于 0"),
  condition: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

export const contractFormSchema = z
  .object({
    title: z.string().min(1, "请输入合同标题"),
    totalAmount: money.positive("合同金额须大于 0"),
    signingType: z.enum(["DIRECT", "INDIRECT"]),
    signCustomerId: z.string().min(1, "请选择签约客户"),
    endUserCustomerId: z.string().min(1, "请选择终用户"),
    signContactId: z.string().min(1, "请选择甲方代表（客户联系人）"),
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
    const installmentSum = data.installments.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(installmentSum - data.totalAmount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `回款计划合计 ${installmentSum.toFixed(2)} 须等于合同金额 ${data.totalAmount.toFixed(2)}`,
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

export const contractRejectSchema = z.object({
  contractId: z.string().min(1),
  rejectReason: z.string().min(1, "请填写驳回原因"),
});
