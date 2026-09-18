"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/opportunities/funnel";
import {
  computeMonthlyCost,
  resolveEffectiveMonthlyCost,
} from "@/lib/personnel/daily-rate";
import { formatLeaveCloseConfirmHint } from "@/lib/personnel/leave-pay";
import {
  updatePersonnelCostsBatch,
  type PersonnelCostRowInput,
} from "@/app/(dashboard)/personnel/actions";
import {
  PayrollSlipDialog,
  type PayrollSlipView,
} from "@/components/personnel/payroll-slip-dialog";

export type PersonnelCostListItem = {
  userId: string;
  name: string;
  email: string | null;
  contributionBase: number | null;
  baseSalary: number | null;
  socialSecurityCompany: number | null;
  housingFundCompany: number | null;
  bonus: number;
  penaltyAmount: number;
  monthAdjustment: number;
  leaveDeductionAmount: number;
  /** 个人实际出勤（关账预览或已锁定） */
  attendanceDays: number;
  absenceDays: number;
  changeSummary: string | null;
  hasMonthRecord?: boolean;
  monthConfirmed?: boolean;
  weekEffectiveDays: number;
  weekCost: number;
  projectCount: number;
  payrollSlip?: PayrollSlipView | null;
};

type RowState = {
  userId: string;
  contributionBase: string;
  baseSalary: string;
  socialSecurityCompany: string;
  housingFundCompany: string;
  bonus: string;
  penaltyAmount: string;
  monthAdjustment: string;
};

function moneyText(value: number | null): string {
  return value != null ? String(value) : "";
}

function moneyTextAllowEmpty(value: number | null | undefined): string {
  if (value == null || value === 0) return "";
  return String(value);
}

function parseMoney(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function rowsFromItems(items: PersonnelCostListItem[]): RowState[] {
  return items.map((item) => ({
    userId: item.userId,
    contributionBase: moneyText(item.contributionBase),
    baseSalary: moneyText(item.baseSalary),
    socialSecurityCompany: moneyText(item.socialSecurityCompany),
    housingFundCompany: moneyText(item.housingFundCompany),
    bonus: moneyTextAllowEmpty(item.bonus),
    penaltyAmount: moneyTextAllowEmpty(item.penaltyAmount),
    monthAdjustment: moneyTextAllowEmpty(item.monthAdjustment),
  }));
}

function displayMoney(raw: string): string {
  const value = parseMoney(raw);
  return value != null ? formatAmount(value) : "—";
}

type Props = {
  items: PersonnelCostListItem[];
  year: number;
  month: number;
  monthWorkdays: number;
  monthFullyConfirmed?: boolean;
};

export function PersonnelCostBatchEditor({
  items,
  year,
  month,
  monthWorkdays,
  monthFullyConfirmed = false,
}: Props) {
  /** 未确认月份直接可编辑；已确认月份默认只读，点「编辑」后再改 */
  const [editing, setEditing] = useState(!monthFullyConfirmed);
  const [rows, setRows] = useState<RowState[]>(() => rowsFromItems(items));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const metaByUser = useMemo(() => {
    return new Map(items.map((item) => [item.userId, item]));
  }, [items]);

  const leaveCloseHint = useMemo(
    () =>
      formatLeaveCloseConfirmHint({
        year,
        month,
        companyDays: monthWorkdays,
        rows: items.map((item) => ({
          name: item.name,
          leaveDeductionAmount: item.leaveDeductionAmount,
          attendanceDays: item.attendanceDays,
          absenceDays: item.absenceDays,
        })),
      }),
    [items, year, month, monthWorkdays]
  );

  const colCount = 14;

  function updateRow(userId: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((row) => (row.userId === userId ? { ...row, ...patch } : row))
    );
  }

  function handleStartEdit() {
    setError(null);
    setRows(rowsFromItems(items));
    setEditing(true);
  }

  function handleCancel() {
    setError(null);
    setRows(rowsFromItems(items));
    // 待确认月份取消只还原数值，仍保持可编辑；已确认月份取消则退回只读
    if (monthFullyConfirmed) {
      setEditing(false);
    }
  }

  function handleSaveClick() {
    setError(null);
    const confirmMessage = monthFullyConfirmed
      ? `确认保存 ${year}年${month}月 全部人员成本修改？保存后仍保持已生效。\n\n${leaveCloseHint}`
      : `确认保存并生效 ${year}年${month}月 全部人员成本？确认后本月所有人将一并生效并参与项目人天核算。\n\n${leaveCloseHint}`;
    if (!window.confirm(confirmMessage)) return;

    const payload: PersonnelCostRowInput[] = rows.map((row) => ({ ...row }));
    startTransition(async () => {
      const result = await updatePersonnelCostsBatch({ year, month, rows: payload });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {monthFullyConfirmed && !editing
            ? `${year}年${month}月 成本已确认生效；如需调整请点「编辑」，改完后保存（整月一并更新）。请假扣款与出勤天数按当前请假记录在保存时重算锁定。`
            : `核对 ${year}年${month}月 奖金、扣罚与基础成本后点「保存」；二次确认后整月一并生效（有效月成本 ÷ 个人实际出勤）。下方「请假扣款 / 实际出勤」为关账预览，确认前不计入项目人力。`}
        </p>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button type="button" variant="outline" onClick={handleCancel} disabled={pending}>
                取消
              </Button>
              <Button type="button" onClick={handleSaveClick} disabled={pending || rows.length === 0}>
                {pending ? "保存中…" : "保存"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={handleStartEdit}>
              编辑
            </Button>
          )}
        </div>
      </div>

      {!monthFullyConfirmed || editing ? (
        <p className="whitespace-pre-line rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {leaveCloseHint}
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-center">姓名</th>
              <th className="px-2 py-2">工资条</th>
              <th className="px-2 py-2">缴费基数</th>
              <th className="px-2 py-2">基本工资</th>
              <th className="px-2 py-2">社保公司承担</th>
              <th className="px-2 py-2">公积金公司承担</th>
              <th className="px-2 py-2">月成本</th>
              <th className="px-2 py-2">奖金</th>
              <th className="px-2 py-2">扣罚</th>
              <th className="px-2 py-2">本月调整</th>
              <th className="px-2 py-2" title="按假种计薪系数汇总，关账时写入">
                请假扣款{monthFullyConfirmed ? "" : "（预览）"}
              </th>
              <th className="px-2 py-2" title="公司出勤 − 计缺勤请假日">
                实际出勤{monthFullyConfirmed ? "" : "（预览）"}
              </th>
              <th className="px-2 py-2">有效月成本</th>
              <th className="px-2 py-2">本月人天（人力成本）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = metaByUser.get(row.userId);
              const monthly = computeMonthlyCost({
                baseSalary: parseMoney(row.baseSalary),
                socialSecurityCompany: parseMoney(row.socialSecurityCompany),
                housingFundCompany: parseMoney(row.housingFundCompany),
              });
              const adjustment = parseMoney(row.monthAdjustment) ?? 0;
              const bonus = parseMoney(row.bonus) ?? 0;
              const penaltyAmount = parseMoney(row.penaltyAmount) ?? 0;
              const leaveDeduction = meta?.leaveDeductionAmount ?? 0;
              const attendanceDays = meta?.attendanceDays ?? 0;
              const absenceDays = meta?.absenceDays ?? 0;
              const effective = resolveEffectiveMonthlyCost(
                monthly,
                adjustment,
                leaveDeduction,
                { bonus, penaltyAmount }
              );

              function moneyField(
                field: keyof Pick<
                  RowState,
                  | "contributionBase"
                  | "baseSalary"
                  | "socialSecurityCompany"
                  | "housingFundCompany"
                  | "bonus"
                  | "penaltyAmount"
                  | "monthAdjustment"
                >,
                extra?: { stepSigned?: boolean }
              ) {
                if (!editing) {
                  return (
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {displayMoney(row[field])}
                    </td>
                  );
                }
                return (
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={extra?.stepSigned ? undefined : "0"}
                      step="0.01"
                      className="w-24"
                      placeholder="0"
                      value={row[field]}
                      onChange={(e) => updateRow(row.userId, { [field]: e.target.value })}
                    />
                  </td>
                );
              }

              return (
                <FragmentRow
                  key={row.userId}
                  colCount={colCount}
                  changeSummary={meta?.changeSummary ?? null}
                >
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 text-center font-medium whitespace-nowrap">
                    {meta?.name}
                  </td>
                  <td className="px-2 py-2">
                    <PayrollSlipDialog slip={meta?.payrollSlip ?? null} />
                  </td>
                  {moneyField("contributionBase")}
                  {moneyField("baseSalary")}
                  {moneyField("socialSecurityCompany")}
                  {moneyField("housingFundCompany")}
                  <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                    {monthly != null ? formatAmount(monthly) : "—"}
                  </td>
                  {moneyField("bonus")}
                  {moneyField("penaltyAmount")}
                  {moneyField("monthAdjustment", { stepSigned: true })}
                  <td
                    className={`px-2 py-2 whitespace-nowrap ${
                      leaveDeduction > 0 ? "font-medium text-amber-800 dark:text-amber-200" : "text-muted-foreground"
                    }`}
                  >
                    {leaveDeduction > 0 ? formatAmount(leaveDeduction) : "—"}
                  </td>
                  <td
                    className={`px-2 py-2 whitespace-nowrap ${
                      attendanceDays <= 0 ? "font-medium text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {attendanceDays}
                    {absenceDays > 0 ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (缺{absenceDays}/{monthWorkdays})
                      </span>
                    ) : (
                      <span className="ml-1 text-xs text-muted-foreground">/{monthWorkdays}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap font-medium">
                    {effective != null ? formatAmount(effective) : "—"}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                    {meta?.weekEffectiveDays ?? 0}
                    {(meta?.weekCost ?? 0) > 0 ? (
                      <span className="ml-1 text-xs">({formatAmount(meta!.weekCost)})</span>
                    ) : null}
                  </td>
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">暂无实施人员。</p>
        ) : null}
      </div>
    </div>
  );
}

function FragmentRow({
  children,
  colCount,
  changeSummary,
}: {
  children: ReactNode;
  colCount: number;
  changeSummary: string | null;
}) {
  return (
    <>
      <tr className="border-b align-top">{children}</tr>
      {changeSummary ? (
        <tr className="border-b bg-muted/20">
          <td colSpan={colCount} className="px-3 py-1.5 text-xs text-muted-foreground">
            {changeSummary}
          </td>
        </tr>
      ) : null}
    </>
  );
}
