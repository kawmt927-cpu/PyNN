"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpHint } from "@/components/ui/help-hint";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatAmount } from "@/lib/opportunities/funnel";
import {
  computeMonthlyCost,
  resolveEffectiveMonthlyCost,
} from "@/lib/personnel/daily-rate";
import { formatLeaveCloseConfirmHint } from "@/lib/personnel/leave-pay";
import {
  excludeResignedPersonnelFromMonthCosts,
  includeResignedPersonnelInMonthCosts,
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
  /** 个人实际出勤（关账锁定值或系统预览） */
  attendanceDays: number;
  /** 系统按请假算出的出勤（对照人工修改） */
  attendanceDaysSystem: number;
  absenceDays: number;
  changeSummary: string | null;
  hasMonthRecord?: boolean;
  monthConfirmed?: boolean;
  resigned?: boolean;
  weekEffectiveDays: number;
  weekCost: number;
  projectCount: number;
  payrollSlip?: PayrollSlipView | null;
};

export type ResignedCostCandidate = {
  userId: string;
  name: string;
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
  attendanceDays: string;
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

function daysClose(a: number, b: number) {
  return Math.abs(a - b) < 0.001;
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
    attendanceDays: String(item.attendanceDays),
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
  /** 本月尚未纳入成本表的离职实施人员 */
  resignedCandidates?: ResignedCostCandidate[];
  /** 标题旁人数/月份摘要，如「12 人 · 2026年9月 · …」 */
  titleMeta?: string;
};

export function PersonnelCostBatchEditor({
  items,
  year,
  month,
  monthWorkdays,
  monthFullyConfirmed = false,
  resignedCandidates = [],
  titleMeta,
}: Props) {
  const router = useRouter();
  /** 未确认月份直接可编辑；已确认月份默认只读，点「编辑」后再改 */
  const [editing, setEditing] = useState(!monthFullyConfirmed);
  const [rows, setRows] = useState<RowState[]>(() => rowsFromItems(items));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedResigned, setSelectedResigned] = useState<string[]>([]);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  /** 正在改出勤的人员；编辑模式下点「改」后显示输入框 */
  const [editingAttendanceUserId, setEditingAttendanceUserId] = useState<
    string | null
  >(null);

  /** 人员增减（添加/移出离职）后同步表格行；编辑中保留已改数值 */
  const rosterKey = useMemo(
    () => items.map((item) => item.userId).join("\0"),
    [items]
  );
  useEffect(() => {
    setRows((prev) => {
      const prevById = new Map(prev.map((row) => [row.userId, row]));
      const fromServer = rowsFromItems(items);
      if (!editing) return fromServer;
      return fromServer.map((row) => prevById.get(row.userId) ?? row);
    });
  }, [rosterKey, year, month, items, editing]);

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

  const colCount = 15;

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
    setSaveConfirmOpen(true);
  }

  function confirmSave() {
    setSaveConfirmOpen(false);
    const payload: PersonnelCostRowInput[] = rows.map((row) => ({ ...row }));
    startTransition(async () => {
      const result = await updatePersonnelCostsBatch({ year, month, rows: payload });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setEditingAttendanceUserId(null);
      router.refresh();
    });
  }

  function openAddResigned() {
    setError(null);
    setSelectedResigned([]);
    setAddOpen(true);
  }

  function toggleResigned(userId: string) {
    setSelectedResigned((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function handleIncludeResigned() {
    if (selectedResigned.length === 0) {
      setError("请选择要纳入的离职人员");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await includeResignedPersonnelInMonthCosts({
        year,
        month,
        userIds: selectedResigned,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAddOpen(false);
      setSelectedResigned([]);
      router.refresh();
    });
  }

  function handleExcludeResigned(userId: string, name: string) {
    setError(null);
    setExcludeTarget({ userId, name });
  }

  function confirmExcludeResigned() {
    if (!excludeTarget) return;
    const { userId } = excludeTarget;
    setExcludeTarget(null);
    startTransition(async () => {
      const result = await excludeResignedPersonnelFromMonthCosts({
        year,
        month,
        userId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const saveConfirmMessage = monthFullyConfirmed
    ? `确认保存 ${year}年${month}月 全部人员成本修改？保存后仍保持已生效。\n\n${leaveCloseHint}`
    : `确认保存并生效 ${year}年${month}月 全部人员成本？确认后本月所有人将一并生效并参与项目人天核算。\n\n${leaveCloseHint}`;

  const helpContent = monthFullyConfirmed ? (
    <div className="space-y-2">
      <p>本月成本已确认生效；如需调整请点「编辑」，改完后保存（整月一并更新）。</p>
      <p>
        有效月成本 ÷ 个人实际出勤。出勤可点「改」手工调整，与系统值不同会标黄并记入变更说明。下方「请假扣款
        / 实际出勤」确认前不计入项目人力。
      </p>
      <p>离职人员默认不出现，可按月手动纳入。</p>
    </div>
  ) : (
    <div className="space-y-2">
      <p>
        核对奖金、扣罚与基础成本后点「保存」；二次确认后整月一并生效（有效月成本 ÷
        个人实际出勤）。
      </p>
      <p>
        下方「请假扣款 / 实际出勤」为关账预览，确认前不计入项目人力。出勤可点「改」手工调整。
      </p>
      <p>离职人员默认不列入；需关账时点「添加离职人员」（仅本月）。</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold leading-none tracking-tight">
          <span className="inline-flex items-center gap-1.5">
            月成本批量编辑
            <HelpHint label="月成本批量编辑说明" content={helpContent} />
          </span>
          {titleMeta ? (
            <span className="text-sm font-normal text-muted-foreground">
              ({titleMeta})
            </span>
          ) : null}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAddResigned}
            disabled={pending || resignedCandidates.length === 0}
            title={
              resignedCandidates.length === 0
                ? "没有可添加的离职人员"
                : "将离职人员纳入本月成本表"
            }
          >
            添加离职人员
            {resignedCandidates.length > 0
              ? `（${resignedCandidates.length}）`
              : ""}
          </Button>
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={pending}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveClick}
                disabled={pending || rows.length === 0}
              >
                {pending ? "保存中…" : "保存"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleStartEdit}>
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
            <tr className="border-b bg-muted/40 text-left align-middle text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-center">姓名</th>
              <th className="w-16 px-2 py-2"> </th>
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
              const systemAttendance =
                meta?.attendanceDaysSystem ?? meta?.attendanceDays ?? 0;
              const attendanceDays =
                parseMoney(row.attendanceDays) ?? systemAttendance;
              const attendanceAdjusted = !daysClose(
                attendanceDays,
                systemAttendance
              );
              const absenceDays = meta?.absenceDays ?? 0;
              const attendanceEditing =
                editing && editingAttendanceUserId === row.userId;
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
                    <td className="whitespace-nowrap px-2 py-2 align-middle text-muted-foreground">
                      {displayMoney(row[field])}
                    </td>
                  );
                }
                return (
                  <td className="px-2 py-2 align-middle">
                    <Input
                      type="number"
                      min={extra?.stepSigned ? undefined : "0"}
                      step="0.01"
                      className="h-8 w-24"
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
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 text-center align-middle font-medium">
                    <span className="inline-flex items-center justify-center gap-1">
                      {meta?.name}
                      {meta?.resigned ? (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground">
                          离职
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-middle">
                    {meta?.resigned && !meta.monthConfirmed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        disabled={pending}
                        onClick={() =>
                          handleExcludeResigned(row.userId, meta.name)
                        }
                      >
                        移出
                      </Button>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <PayrollSlipDialog slip={meta?.payrollSlip ?? null} />
                  </td>
                  {moneyField("contributionBase")}
                  {moneyField("baseSalary")}
                  {moneyField("socialSecurityCompany")}
                  {moneyField("housingFundCompany")}
                  <td className="whitespace-nowrap px-2 py-2 align-middle text-muted-foreground">
                    {monthly != null ? formatAmount(monthly) : "—"}
                  </td>
                  {moneyField("bonus")}
                  {moneyField("penaltyAmount")}
                  {moneyField("monthAdjustment", { stepSigned: true })}
                  <td
                    className={`whitespace-nowrap px-2 py-2 align-middle ${
                      leaveDeduction > 0 ? "font-medium text-amber-800 dark:text-amber-200" : "text-muted-foreground"
                    }`}
                  >
                    {leaveDeduction > 0 ? formatAmount(leaveDeduction) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-middle text-muted-foreground">
                    <AttendanceDaysControl
                      attendanceDays={attendanceDays}
                      systemAttendance={systemAttendance}
                      absenceDays={absenceDays}
                      monthWorkdays={monthWorkdays}
                      adjusted={attendanceAdjusted}
                      editing={editing}
                      attendanceEditing={attendanceEditing}
                      attendanceRaw={row.attendanceDays}
                      pending={pending}
                      onStartEdit={() => setEditingAttendanceUserId(row.userId)}
                      onFinishEdit={() => setEditingAttendanceUserId(null)}
                      onChangeRaw={(value) =>
                        updateRow(row.userId, { attendanceDays: value })
                      }
                      onRestore={() => {
                        updateRow(row.userId, {
                          attendanceDays: String(systemAttendance),
                        });
                        setEditingAttendanceUserId(null);
                      }}
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-middle font-medium">
                    {effective != null ? formatAmount(effective) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 align-middle text-muted-foreground">
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
          <p className="py-6 text-center text-muted-foreground">
            暂无在职实施人员。如需为离职人员关账，请点「添加离职人员」。
          </p>
        ) : null}
      </div>

      <ConfirmDestructiveDialog
        open={saveConfirmOpen}
        title={monthFullyConfirmed ? "确认保存修改" : "确认保存并生效"}
        message={saveConfirmMessage}
        confirmLabel={monthFullyConfirmed ? "确认保存" : "确认生效"}
        variant="default"
        pending={pending}
        onCancel={() => setSaveConfirmOpen(false)}
        onConfirm={confirmSave}
      />

      <ConfirmDestructiveDialog
        open={!!excludeTarget}
        title="移出本月成本表"
        message={
          excludeTarget
            ? `将「${excludeTarget.name}」移出 ${year}年${month}月 成本表？仅删除未确认草稿，不影响其他月份；下月默认仍不出现。`
            : ""
        }
        confirmLabel="移出"
        pending={pending}
        onCancel={() => setExcludeTarget(null)}
        onConfirm={confirmExcludeResigned}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              添加离职人员到 {year}年{month}月
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            仅纳入本月成本表；下月默认仍不出现。可从上月记录复制基数，再按需改数保存。
          </p>
          {resignedCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有可添加的离职人员。</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
              {resignedCandidates.map((c) => {
                const checked = selectedResigned.includes(c.userId);
                return (
                  <li key={c.userId}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={() => toggleResigned(c.userId)}
                      />
                      <span>{c.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setAddOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={pending || selectedResigned.length === 0}
              onClick={handleIncludeResigned}
            >
              {pending ? "添加中…" : `纳入本月（${selectedResigned.length}）`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
      <tr className="border-b align-middle">{children}</tr>
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

function AttendanceDaysControl(props: {
  attendanceDays: number;
  systemAttendance: number;
  absenceDays: number;
  monthWorkdays: number;
  adjusted: boolean;
  editing: boolean;
  attendanceEditing: boolean;
  attendanceRaw: string;
  pending: boolean;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onChangeRaw: (value: string) => void;
  onRestore: () => void;
}) {
  const {
    attendanceDays,
    systemAttendance,
    absenceDays,
    monthWorkdays,
    adjusted,
    editing,
    attendanceEditing,
    attendanceRaw,
    pending,
    onStartEdit,
    onFinishEdit,
    onChangeRaw,
    onRestore,
  } = props;
  const [hoverOpen, setHoverOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openHover() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (adjusted) setHoverOpen(true);
  }

  function scheduleCloseHover() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHoverOpen(false), 150);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const suffix =
    absenceDays > 0 ? (
      <span className="text-xs text-muted-foreground">
        (缺{absenceDays}/{monthWorkdays})
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">/{monthWorkdays}</span>
    );

  const daysNode = attendanceEditing ? (
    <Input
      type="number"
      min="0"
      step="0.5"
      className="h-8 w-20"
      value={attendanceRaw}
      disabled={pending}
      onChange={(e) => onChangeRaw(e.target.value)}
    />
  ) : (
    <span
      className={
        attendanceDays <= 0
          ? "font-medium text-destructive"
          : adjusted
            ? "rounded bg-amber-100 px-1 font-medium tabular-nums text-amber-900 dark:bg-amber-950/60 dark:text-amber-100"
            : "tabular-nums"
      }
    >
      {attendanceDays}
    </span>
  );

  return (
    <div className="inline-flex flex-wrap items-center gap-1 leading-none">
      {adjusted && !attendanceEditing ? (
        <Popover open={hoverOpen} onOpenChange={setHoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded text-left"
              onMouseEnter={openHover}
              onMouseLeave={scheduleCloseHover}
            >
              {daysNode}
              {suffix}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto max-w-xs space-y-2 p-3"
            onMouseEnter={openHover}
            onMouseLeave={scheduleCloseHover}
          >
            <p className="text-sm">
              实际出勤 {systemAttendance} 天，修改为 {attendanceDays} 天
            </p>
            {editing ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={pending}
                onClick={() => {
                  onRestore();
                  setHoverOpen(false);
                }}
              >
                恢复
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : (
        <>
          {daysNode}
          {!attendanceEditing ? suffix : null}
        </>
      )}
      {editing ? (
        <button
          type="button"
          disabled={pending}
          className="inline-flex h-6 shrink-0 items-center rounded border border-border bg-background px-1.5 text-xs text-foreground hover:bg-muted disabled:opacity-50"
          onClick={() => {
            if (attendanceEditing) onFinishEdit();
            else onStartEdit();
          }}
        >
          {attendanceEditing ? "完成" : "改"}
        </button>
      ) : null}
    </div>
  );
}
