"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import {
  ALL_ROLES,
  PERMISSION_DEFS,
  type PermissionKey,
} from "@/lib/rbac/permission-keys";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import {
  saveRolePermissions,
  updateUserRoleQuick,
} from "@/app/(dashboard)/admin/roles/actions";
import type { RoleUserCounts } from "@/lib/rbac/permission-keys";

type Member = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  personnelProfile: { enabled: boolean } | null;
};

type PendingRoleMove = {
  member: Member;
  nextRole: UserRole;
};

type Props = {
  roleCounts: RoleUserCounts;
  initialRole: UserRole;
  initialPermissions: Record<PermissionKey, boolean>;
  members: Member[];
};

export function RolePermissionsSettings({
  roleCounts,
  initialRole,
  initialPermissions,
  members: initialMembers,
}: Props) {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>(initialRole);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [members, setMembers] = useState(initialMembers);
  const [pendingMove, setPendingMove] = useState<PendingRoleMove | null>(null);
  const [showResigned, setShowResigned] = useState(false);
  const [counts, setCounts] = useState(roleCounts);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRole(initialRole);
    setPermissions(initialPermissions);
    setMembers(initialMembers);
    setPendingMove(null);
    setMessage(null);
    setError(null);
  }, [initialRole, initialPermissions, initialMembers]);

  useEffect(() => {
    setCounts(roleCounts);
  }, [roleCounts]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_DEFS>();
    for (const def of PERMISSION_DEFS) {
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return [...map.entries()];
  }, []);

  const displayCounts = showResigned ? counts.total : counts.active;
  const totalResigned = useMemo(
    () => ALL_ROLES.reduce((sum, r) => sum + (counts.total[r] - counts.active[r]), 0),
    [counts]
  );
  const resignedCount = useMemo(
    () => members.filter((m) => m.personnelProfile?.enabled === false).length,
    [members]
  );
  const visibleMembers = useMemo(
    () =>
      showResigned
        ? members
        : members.filter((m) => m.personnelProfile?.enabled !== false),
    [members, showResigned]
  );

  function onRoleChange(next: UserRole) {
    if (next === role) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "roles");
    url.searchParams.set("role", next);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
  }

  function toggleKey(key: PermissionKey) {
    const def = PERMISSION_DEFS.find((d) => d.key === key);
    if (role === "ADMIN" && def?.lockedForAdmin) return;
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function savePermissions() {
    setMessage(null);
    setError(null);
    const enabledKeys = (Object.entries(permissions) as [PermissionKey, boolean][])
      .filter(([, on]) => on)
      .map(([k]) => k);
    startTransition(async () => {
      const res = await saveRolePermissions(role, enabledKeys);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("权限已保存");
    });
  }

  function requestMemberRoleChange(userId: string, nextRole: UserRole) {
    const member = members.find((m) => m.id === userId);
    if (!member || nextRole === member.role) return;
    setMessage(null);
    setError(null);
    setPendingMove({ member, nextRole });
  }

  function cancelMemberRoleChange() {
    if (pending) return;
    setPendingMove(null);
  }

  function confirmMemberRoleChange() {
    if (!pendingMove) return;
    const { member, nextRole } = pendingMove;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await updateUserRoleQuick(member.id, nextRole);
      if (res.error) {
        setError(res.error);
        setPendingMove(null);
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      const resigned = member.personnelProfile?.enabled === false;
      setCounts((prev) => {
        const next = {
          total: { ...prev.total },
          active: { ...prev.active },
        };
        next.total[member.role] = Math.max(0, next.total[member.role] - 1);
        next.total[nextRole] = (next.total[nextRole] ?? 0) + 1;
        if (!resigned) {
          next.active[member.role] = Math.max(0, next.active[member.role] - 1);
          next.active[nextRole] = (next.active[nextRole] ?? 0) + 1;
        }
        return next;
      });
      setPendingMove(null);
      setMessage(`已将「${member.name}」调整为${ROLE_LABELS[nextRole]}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-none tracking-tight">角色权限</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showResigned}
            onChange={(e) => setShowResigned(e.target.checked)}
          />
          显示离职人员
          {totalResigned > 0 ? (
            <span className="text-xs">（{totalResigned}）</span>
          ) : null}
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRoleChange(r)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              r === role
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            {ROLE_LABELS[r]}
            <span className="ml-1 opacity-70">({displayCounts[r] ?? 0})</span>
          </button>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">
          人员归属（{ROLE_LABELS[role]} · {visibleMembers.length}
          {!showResigned && resignedCount > 0 ? ` / ${members.length}` : ""} 人）
        </h3>
        {visibleMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {members.length === 0
              ? "该角色下暂无用户"
              : "当前无在职人员；勾选「显示离职人员」可查看"}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">联系方式</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">调整角色</th>
                </tr>
              </thead>
              <tbody>
                {visibleMembers.map((m) => {
                  const resigned = m.personnelProfile?.enabled === false;
                  return (
                    <tr
                      key={m.id}
                      className={`border-t ${resigned ? "bg-slate-50 text-muted-foreground" : ""}`}
                    >
                      <td className="px-3 py-2">{m.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {m.phone || m.email || "—"}
                      </td>
                      <td className="px-3 py-2">{resigned ? "离职" : "在职"}</td>
                      <td className="px-3 py-2">
                        <Label className="sr-only">角色</Label>
                        <select
                          className="h-8 rounded border px-2 text-sm"
                          value={m.role}
                          disabled={pending}
                          onChange={(e) =>
                            requestMemberRoleChange(m.id, e.target.value as UserRole)
                          }
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700">
        <div className="mb-1.5 text-xs font-medium text-slate-500">审批链路（按角色职责）</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <span className="font-medium">销售类</span>
            ：管理员 / 销售管理审批（认领、代录确认、合同审核等）
          </li>
          <li>
            <span className="font-medium">项目类</span>
            ：管理员 / 项目管理员；项目经理暂与项目人员同权
          </li>
          <li>
            <span className="font-medium">报销</span>
            ：上级（销售管理或项目管理员）→ 行政人事确认 → 管理员终审打款
          </li>
        </ul>
      </div>

      {(message || error) && (
        <p className={`text-sm ${error ? "text-red-600" : "text-emerald-700"}`}>
          {error ?? message}
        </p>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">权限矩阵</h3>
        <p className="text-xs text-muted-foreground">
          入口开关控制侧栏可见；下方「销售流程 / 协作 / 报销」等为审批与流程能力，请按上表链路配置。
        </p>
        {groups.map(([group, defs]) => (
          <div key={group} className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">{group}</div>
            <div className="space-y-2">
              {defs.map((def) => {
                const locked = role === "ADMIN" && !!def.lockedForAdmin;
                return (
                  <label
                    key={def.key}
                    className={`flex items-start gap-2 text-sm ${locked ? "opacity-70" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!permissions[def.key]}
                      disabled={locked || pending}
                      onChange={() => toggleKey(def.key)}
                    />
                    <span>
                      <span className="font-medium">{def.label}</span>
                      {locked ? (
                        <span className="ml-1 text-xs text-amber-700">（管理员不可关闭）</span>
                      ) : null}
                      <span className="block text-xs text-muted-foreground">
                        {def.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <Button type="button" disabled={pending} onClick={savePermissions}>
          保存权限
        </Button>
      </section>

      <ConfirmDestructiveDialog
        open={pendingMove != null}
        title="确认调整角色"
        message={
          pendingMove
            ? `将「${pendingMove.member.name}」从「${ROLE_LABELS[pendingMove.member.role]}」调整为「${ROLE_LABELS[pendingMove.nextRole]}」？权限会立即按新角色生效。`
            : ""
        }
        confirmLabel="确认调整"
        variant="default"
        pending={pending}
        onCancel={cancelMemberRoleChange}
        onConfirm={confirmMemberRoleChange}
      />
    </div>
  );
}
