"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALL_ROLES } from "@/lib/rbac/permission-keys";
import { ROLE_LABELS } from "@/lib/permissions";
import type {
  ExpenseFlowMapping,
  ExpenseFlowParty,
  ExpenseFlowStepConfig,
} from "@/lib/expenses/approval-flow";
import {
  EXPENSE_FLOW_SUBMITTER_ROLES,
  emptyMapping,
  missingSubmitterRolesInStep,
  partyIsEmpty,
} from "@/lib/expenses/approval-flow";
import { saveExpenseApprovalFlow } from "@/app/(dashboard)/admin/settings/actions";

type UserOption = { id: string; name: string; role: UserRole };

type Props = {
  initialSteps: ExpenseFlowStepConfig[];
  users: UserOption[];
};

function emptyParty(): ExpenseFlowParty {
  return { roles: [], userIds: [] };
}

function emptyStep(index: number): ExpenseFlowStepConfig {
  return {
    id: `new-${Date.now()}-${index}`,
    sortOrder: index,
    name: `审批节点 ${index + 1}`,
    mappings: [],
    isFinalPayout: false,
  };
}

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function formatPartySummary(
  party: ExpenseFlowParty,
  userLabel: Map<string, string>
): string {
  if (party.userIds.length > 0) {
    return party.userIds.map((id) => userLabel.get(id) ?? id).join("、");
  }
  if (party.roles.length > 0) {
    return party.roles.map((r) => ROLE_LABELS[r] ?? r).join("、");
  }
  return "未设置";
}

function usedApplicantExclusions(mappings: ExpenseFlowMapping[]): {
  roles: Set<UserRole>;
  userIds: Set<string>;
} {
  const roles = new Set<UserRole>();
  const userIds = new Set<string>();
  for (const m of mappings) {
    for (const r of m.applicants.roles) roles.add(r);
    for (const id of m.applicants.userIds) userIds.add(id);
  }
  return { roles, userIds };
}

/** 弹窗内：角色 / 固定人员二选一 */
function PartyPicker({
  title,
  party,
  users,
  userLabel,
  allowSkip,
  skip,
  excludeRoles,
  excludeUserIds,
  onChange,
  onSkipChange,
}: {
  title: string;
  party: ExpenseFlowParty;
  users: UserOption[];
  userLabel: Map<string, string>;
  allowSkip?: boolean;
  skip?: boolean;
  /** 已占用的角色（申请人侧防重复） */
  excludeRoles?: Set<UserRole>;
  /** 已占用的固定人员（申请人侧防重复） */
  excludeUserIds?: Set<string>;
  onChange: (party: ExpenseFlowParty) => void;
  onSkipChange?: (skip: boolean) => void;
}) {
  const isSkip = Boolean(skip);
  const peopleMode = party.userIds.length > 0;
  const [peoplePickerOpen, setPeoplePickerOpen] = useState(false);
  const [draftUserIds, setDraftUserIds] = useState<string[]>(party.userIds);

  const availableRoles = ALL_ROLES.filter((role) => !excludeRoles?.has(role));
  const availableUsers = users.filter((u) => !excludeUserIds?.has(u.id));

  return (
    <div
      className={
        isSkip
          ? "space-y-2 rounded-md border border-green-300 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/40"
          : "space-y-2 rounded-md border p-3"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {allowSkip ? (
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={isSkip}
              onChange={(e) => onSkipChange?.(e.target.checked)}
            />
            <span
              className={
                isSkip
                  ? "rounded bg-green-600 px-1.5 py-0.5 text-xs font-medium text-white"
                  : "text-muted-foreground"
              }
            >
              跳过
            </span>
          </label>
        ) : null}
      </div>

      {isSkip ? (
        <p className="text-xs text-green-800 dark:text-green-200">
          匹配此映射的申请人将跳过本节点。
        </p>
      ) : (
        <>
          <div className="flex gap-1 rounded-md border p-0.5">
            <button
              type="button"
              className={
                peopleMode
                  ? "flex-1 rounded px-2 py-1 text-xs text-muted-foreground"
                  : "flex-1 rounded bg-muted px-2 py-1 text-xs font-medium"
              }
              onClick={() => {
                if (peopleMode) onChange({ roles: [], userIds: [] });
              }}
            >
              按角色
            </button>
            <button
              type="button"
              className={
                peopleMode
                  ? "flex-1 rounded bg-muted px-2 py-1 text-xs font-medium"
                  : "flex-1 rounded px-2 py-1 text-xs text-muted-foreground"
              }
              onClick={() => {
                setDraftUserIds(party.userIds);
                setPeoplePickerOpen(true);
              }}
            >
              固定人员
            </button>
          </div>

          {peopleMode ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {party.userIds.map((id) => userLabel.get(id) ?? id).join("、") || "尚未选择"}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftUserIds(party.userIds);
                  setPeoplePickerOpen(true);
                }}
              >
                重新选择人员
              </Button>
            </div>
          ) : availableRoles.length === 0 ? (
            <p className="text-xs text-muted-foreground">本节点可勾选角色已全部映射</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableRoles.map((role) => (
                <label key={role} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={party.roles.includes(role)}
                    onChange={() =>
                      onChange({
                        roles: toggleInList(party.roles, role),
                        userIds: [],
                      })
                    }
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          )}

          <Dialog open={peoplePickerOpen} onOpenChange={setPeoplePickerOpen}>
            <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto" showCloseButton>
              <DialogHeader>
                <DialogTitle>选择固定人员</DialogTitle>
              </DialogHeader>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {availableUsers.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    暂无可选人员（可能均已映射）
                  </p>
                ) : (
                  availableUsers.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={draftUserIds.includes(u.id)}
                        onChange={() =>
                          setDraftUserIds((prev) => toggleInList(prev, u.id))
                        }
                      />
                      <span>{userLabel.get(u.id) ?? u.name}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPeoplePickerOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    onChange({ roles: [], userIds: draftUserIds });
                    setPeoplePickerOpen(false);
                  }}
                >
                  确定
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function AddMappingDialog({
  open,
  onOpenChange,
  allowSkip,
  users,
  userLabel,
  excludeApplicantRoles,
  excludeApplicantUserIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowSkip: boolean;
  users: UserOption[];
  userLabel: Map<string, string>;
  excludeApplicantRoles: Set<UserRole>;
  excludeApplicantUserIds: Set<string>;
  onConfirm: (mapping: ExpenseFlowMapping) => void;
}) {
  const [applicants, setApplicants] = useState<ExpenseFlowParty>(emptyParty());
  const [approvers, setApprovers] = useState<ExpenseFlowParty & { skip: boolean }>({
    ...emptyParty(),
    skip: false,
  });
  const [formError, setFormError] = useState<string | null>(null);

  function reset() {
    setApplicants(emptyParty());
    setApprovers({ ...emptyParty(), skip: false });
    setFormError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function submit() {
    if (partyIsEmpty(applicants)) {
      setFormError("请选择申请人（角色或固定人员）");
      return;
    }
    if (!approvers.skip && partyIsEmpty(approvers)) {
      setFormError("请选择审批人，或勾选跳过");
      return;
    }
    const mapping = emptyMapping();
    mapping.applicants = applicants;
    mapping.approvers = approvers.skip
      ? { roles: [], userIds: [], skip: true }
      : { roles: approvers.roles, userIds: approvers.userIds, skip: false };
    onConfirm(mapping);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton>
        <DialogHeader>
          <DialogTitle>添加映射</DialogTitle>
        </DialogHeader>
        <p className="mb-3 text-xs text-muted-foreground">
          申请人侧不显示本节点已映射的角色/人员。若某人既在固定人员映射、又落在角色映射中，执行时优先走固定人员映射。
        </p>
        <div className="space-y-3">
          <PartyPicker
            title="申请人"
            party={applicants}
            users={users}
            userLabel={userLabel}
            excludeRoles={excludeApplicantRoles}
            excludeUserIds={excludeApplicantUserIds}
            onChange={setApplicants}
          />
          <PartyPicker
            title="审批人"
            party={approvers}
            users={users}
            userLabel={userLabel}
            allowSkip={allowSkip}
            skip={approvers.skip}
            onSkipChange={(skip) =>
              setApprovers(
                skip
                  ? { roles: [], userIds: [], skip: true }
                  : { ...emptyParty(), skip: false }
              )
            }
            onChange={(party) => setApprovers({ ...party, skip: false })}
          />
        </div>
        {formError ? <p className="mt-2 text-sm text-destructive">{formError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={submit}>
            确定
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseApprovalFlowSettings({ initialSteps, users }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<ExpenseFlowStepConfig[]>(initialSteps);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mappingDialogStepIndex, setMappingDialogStepIndex] = useState<number | null>(null);

  const userLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, `${u.name}（${ROLE_LABELS[u.role] ?? u.role}）`);
    return m;
  }, [users]);

  const usersByRole = useMemo(() => {
    const m = new Map<UserRole, number>();
    for (const u of users) m.set(u.role, (m.get(u.role) ?? 0) + 1);
    return m;
  }, [users]);

  const dialogExclusions = useMemo(() => {
    if (mappingDialogStepIndex == null) {
      return { roles: new Set<UserRole>(), userIds: new Set<string>() };
    }
    return usedApplicantExclusions(steps[mappingDialogStepIndex]?.mappings ?? []);
  }, [mappingDialogStepIndex, steps]);

  const coverageHints = useMemo(() => {
    const hints: string[] = [];
    for (const step of steps) {
      const missing = missingSubmitterRolesInStep(step);
      if (missing.length > 0) {
        hints.push(
          `「${step.name}」未覆盖：${missing.map((r) => ROLE_LABELS[r]).join("、")}（请继续添加映射）`
        );
      }
      if (step.mappings.length === 0) {
        hints.push(`「${step.name}」尚无映射`);
      }
      step.mappings.forEach((m, mi) => {
        if (partyIsEmpty(m.applicants)) {
          hints.push(`「${step.name}」映射 ${mi + 1}：申请人侧为空`);
        }
        if (!m.approvers.skip && partyIsEmpty(m.approvers)) {
          hints.push(`「${step.name}」映射 ${mi + 1}：审批人侧为空（或勾选跳过）`);
        }
        if (!m.approvers.skip) {
          for (const role of m.approvers.roles) {
            if ((usersByRole.get(role) ?? 0) === 0) {
              hints.push(
                `「${step.name}」映射 ${mi + 1}：审批角色「${ROLE_LABELS[role]}」无账号`
              );
            }
          }
        }
      });
    }
    const finals = steps.filter((s) => s.isFinalPayout);
    if (finals.length !== 1) hints.push("须恰好有一个打款结案节点");
    if (finals[0]?.mappings.some((m) => m.approvers.skip)) {
      hints.push("打款结案节点的映射不能跳过");
    }
    return hints;
  }, [steps, usersByRole]);

  function updateStep(index: number, patch: Partial<ExpenseFlowStepConfig>) {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== index) {
          if (patch.isFinalPayout) return { ...s, isFinalPayout: false };
          return s;
        }
        return { ...s, ...patch };
      })
    );
  }

  function moveStep(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row!);
      return copy.map((s, i) => ({ ...s, sortOrder: i }));
    });
  }

  function save() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await saveExpenseApprovalFlow({ steps });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("审批流程已保存（仅对新提交单据生效）");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">报销审批流程</p>
        <p className="mt-1">
          每个节点按顺序执行。点击「添加映射」在弹窗中勾选申请人与审批人，确认后以表格显示；不断添加直至覆盖所有可报销人员。固定人员映射优先于角色映射。审批人可设
          <span className="mx-1 rounded bg-green-600 px-1 py-0.5 text-xs text-white">跳过</span>
          。须恰好一个打款结案节点。
        </p>
      </div>

      {coverageHints.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">保存前需处理</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {coverageHints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-4">
        {steps.map((step, stepIndex) => {
          const missing = missingSubmitterRolesInStep(step);
          const covered = EXPENSE_FLOW_SUBMITTER_ROLES.map((role) => ({
            role,
            ok: !missing.includes(role),
          }));
          return (
            <div key={step.id} className="space-y-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  节点 {stepIndex + 1}
                  {step.isFinalPayout ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      （打款结案）
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending || stepIndex === 0}
                    onClick={() => moveStep(stepIndex, -1)}
                  >
                    上移
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending || stepIndex === steps.length - 1}
                    onClick={() => moveStep(stepIndex, 1)}
                  >
                    下移
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={pending || steps.length <= 1}
                    onClick={() =>
                      setSteps((prev) => prev.filter((_, i) => i !== stepIndex))
                    }
                  >
                    删除节点
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>节点名称</Label>
                  <Input
                    value={step.name}
                    disabled={pending}
                    onChange={(e) => updateStep(stepIndex, { name: e.target.value })}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={step.isFinalPayout}
                    disabled={pending}
                    onChange={(e) =>
                      updateStep(stepIndex, { isFinalPayout: e.target.checked })
                    }
                  />
                  本节点为打款结案
                </label>
              </div>

              <div className="rounded-md border border-dashed p-2">
                <p className="mb-2 text-xs text-muted-foreground">本节点申请人覆盖</p>
                <ul className="flex flex-wrap gap-1.5">
                  {covered.map(({ role, ok }) => (
                    <li
                      key={role}
                      className={
                        ok
                          ? "rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100"
                          : "rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 text-[11px] text-destructive"
                      }
                    >
                      {ok ? "✓" : "缺"} {ROLE_LABELS[role]}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">申请人</th>
                      <th className="px-3 py-2 font-medium">审批人</th>
                      <th className="w-16 px-2 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {step.mappings.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-3 text-xs text-muted-foreground"
                        >
                          暂无映射，请点击下方添加
                        </td>
                      </tr>
                    ) : (
                      step.mappings.map((mapping, mapIndex) => (
                        <tr key={mapping.id} className="border-b last:border-0">
                          <td className="px-3 py-2 align-middle leading-snug">
                            {formatPartySummary(mapping.applicants, userLabel)}
                          </td>
                          <td className="px-3 py-2 align-middle leading-snug">
                            {mapping.approvers.skip ? (
                              <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                跳过
                              </span>
                            ) : (
                              formatPartySummary(mapping.approvers, userLabel)
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right align-middle">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={pending}
                              onClick={() =>
                                updateStep(stepIndex, {
                                  mappings: step.mappings.filter((_, i) => i !== mapIndex),
                                })
                              }
                            >
                              删除
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setMappingDialogStepIndex(stepIndex)}
              >
                添加映射
              </Button>
            </div>
          );
        })}
      </div>

      <AddMappingDialog
        open={mappingDialogStepIndex != null}
        onOpenChange={(open) => {
          if (!open) setMappingDialogStepIndex(null);
        }}
        allowSkip={
          mappingDialogStepIndex != null
            ? !steps[mappingDialogStepIndex]?.isFinalPayout
            : true
        }
        users={users}
        userLabel={userLabel}
        excludeApplicantRoles={dialogExclusions.roles}
        excludeApplicantUserIds={dialogExclusions.userIds}
        onConfirm={(mapping) => {
          if (mappingDialogStepIndex == null) return;
          const idx = mappingDialogStepIndex;
          setSteps((prev) =>
            prev.map((s, i) =>
              i === idx ? { ...s, mappings: [...s.mappings, mapping] } : s
            )
          );
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setSteps((prev) => [...prev, emptyStep(prev.length)])}
        >
          添加节点
        </Button>
        <Button type="button" disabled={pending || coverageHints.length > 0} onClick={save}>
          保存流程
        </Button>
      </div>

      {coverageHints.length > 0 ? (
        <p className="text-xs text-muted-foreground">请先消除上方缺口后再保存。</p>
      ) : null}
      {message ? <p className="text-sm text-green-700 dark:text-green-400">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
