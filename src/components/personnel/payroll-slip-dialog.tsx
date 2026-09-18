"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAmount } from "@/lib/opportunities/funnel";

export type PayrollSlipView = {
  userId: string;
  name: string;
  year: number;
  month: number;
  payrollEntity: string | null;
  contributionBase: number | null;
  baseSalary: number | null;
  bonus: number | null;
  penaltyAmount?: number | null;
  performancePay: number | null;
  wageAdjust: number | null;
  sickLeaveDays: number | null;
  sickLeaveDeduction: number | null;
  personalLeaveDays: number | null;
  personalLeaveDeduction: number | null;
  payableWage: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
  pensionPersonal: number | null;
  medicalPersonal: number | null;
  unemploymentPersonal: number | null;
  socialSecurityPersonal: number | null;
  housingFundPersonal: number | null;
  incomeTax: number | null;
  netPay: number | null;
  adjustmentAmount: number;
  leaveDeductionAmount: number;
  companyMonthlyCost: number | null;
  effectiveMonthlyCost: number | null;
  notes: string | null;
};

function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return formatAmount(v);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function PayrollSlipDialog({ slip }: { slip: PayrollSlipView | null }) {
  const [open, setOpen] = useState(false);
  if (!slip) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled className="h-7 px-2 text-xs">
        无工资条
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        工资条
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {slip.name} · {slip.year}年{slip.month}月工资条
              {slip.payrollEntity ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  （{slip.payrollEntity}）
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          <section className="space-y-0.5">
            <p className="mb-1 text-xs font-medium text-muted-foreground">应发</p>
            <Row label="缴费基数" value={money(slip.contributionBase)} />
            <Row label="基本工资" value={money(slip.baseSalary)} />
            <Row label="奖金" value={money(slip.bonus)} />
            <Row label="绩效工资" value={money(slip.performancePay)} />
            <Row label="加减工资" value={money(slip.wageAdjust)} />
            <Row
              label="病假"
              value={
                slip.sickLeaveDays != null || slip.sickLeaveDeduction != null
                  ? `${slip.sickLeaveDays ?? "—"} 天 / 扣 ${money(slip.sickLeaveDeduction)}`
                  : "—"
              }
            />
            <Row
              label="事假"
              value={
                slip.personalLeaveDays != null || slip.personalLeaveDeduction != null
                  ? `${slip.personalLeaveDays ?? "—"} 天 / 扣 ${money(slip.personalLeaveDeduction)}`
                  : "—"
              }
            />
            <Row label="应付工资" value={money(slip.payableWage)} />
          </section>

          <section className="mt-4 space-y-0.5">
            <p className="mb-1 text-xs font-medium text-muted-foreground">个人扣款</p>
            <Row label="养老（个人）" value={money(slip.pensionPersonal)} />
            <Row label="医疗（个人）" value={money(slip.medicalPersonal)} />
            <Row label="失业（个人）" value={money(slip.unemploymentPersonal)} />
            <Row label="扣社保合计" value={money(slip.socialSecurityPersonal)} />
            <Row label="扣公积金" value={money(slip.housingFundPersonal)} />
            <Row label="个税" value={money(slip.incomeTax)} />
            <Row label="税后实发" value={money(slip.netPay)} />
          </section>

          <section className="mt-4 space-y-0.5">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              公司成本（项目人天核算）
            </p>
            <Row label="社保公司承担" value={money(slip.socialSecurityCompany)} />
            <Row label="公积金公司承担" value={money(slip.housingFundCompany)} />
            <Row label="奖金（进核算）" value={money(slip.bonus)} />
            <Row label="扣罚" value={money(slip.penaltyAmount)} />
            <Row label="本月调整" value={money(slip.adjustmentAmount)} />
            <Row label="请假扣款合计" value={money(slip.leaveDeductionAmount)} />
            <Row label="固定月成本" value={money(slip.companyMonthlyCost)} />
            <Row label="有效月成本" value={money(slip.effectiveMonthlyCost)} />
          </section>

          {slip.notes ? (
            <p className="mt-3 text-xs text-muted-foreground">{slip.notes}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
