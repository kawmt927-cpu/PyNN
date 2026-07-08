"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  createUser,
  resetUserPassword,
  updateUser,
} from "@/app/(dashboard)/admin/users/actions";
import type { ActionResult } from "@/lib/action-result";

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as UserRole[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

type Props = {
  userId?: string;
  defaultValues?: {
    name: string;
    email: string;
    role: UserRole;
    enabled: boolean;
    isPresales: boolean;
    dailyRate?: number | null;
    wecomUserId?: string | null;
  };
};

export function UserForm({ userId, defaultValues }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(defaultValues?.role ?? "SALES");
  const [isPresales, setIsPresales] = useState(defaultValues?.isPresales ?? false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const showPresales =
    role === "PROJECT_ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "PROJECT_STAFF";

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = userId ? updateUser : createUser;
      if (userId) formData.set("id", userId);
      const result: ActionResult = await action(formData);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleResetPassword() {
    if (!userId || newPassword.length < 6) {
      setResetMsg("请输入至少 6 位新密码");
      return;
    }
    setResetMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", userId);
      fd.set("password", newPassword);
      const result = await resetUserPassword(fd);
      if (result.error) setResetMsg(result.error);
      else {
        setResetMsg("密码已重置");
        setNewPassword("");
      }
    });
  }

  return (
    <div className="space-y-8">
      <form action={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input id="name" name="name" required defaultValue={defaultValues?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={defaultValues?.email}
            />
          </div>
        </div>

        <SelectField
          id="role"
          name="role"
          label="角色"
          value={role}
          onValueChange={(v) => setRole(v as UserRole)}
          options={ROLE_OPTIONS}
          required
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={defaultValues?.enabled ?? true}
            className="h-4 w-4 rounded border"
          />
          账号启用（停用后无法登录）
        </label>

        {showPresales ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPresales"
                checked={isPresales}
                onChange={(e) => setIsPresales(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              售前人员（可参与售前成本结算）
            </label>
            <div className="space-y-2">
              <Label htmlFor="dailyRate">日单价（元）</Label>
              <Input
                id="dailyRate"
                name="dailyRate"
                type="number"
                min="0"
                step="0.01"
                required={isPresales}
                defaultValue={defaultValues?.dailyRate ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                用于项目人力成本分摊；售前人员必填。
              </p>
            </div>
          </>
        ) : null}

        {!userId ? (
          <div className="space-y-2">
            <Label htmlFor="password">初始密码</Label>
            <Input id="password" name="password" type="password" required minLength={6} />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="password">修改密码（留空则不修改）</Label>
            <Input id="password" name="password" type="password" minLength={6} />
          </div>
        )}

        {defaultValues?.wecomUserId ? (
          <p className="text-sm text-muted-foreground">
            已绑定企微 UserID：
            <span className="ml-1 font-mono text-xs">{defaultValues.wecomUserId}</span>
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : userId ? "保存修改" : "创建用户"}
        </Button>
      </form>

      {userId ? (
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">重置密码</p>
          <div className="flex flex-wrap gap-2">
            <Input
              type="password"
              placeholder="新密码（至少 6 位）"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" onClick={handleResetPassword} disabled={pending}>
              重置密码
            </Button>
          </div>
          {resetMsg ? <p className="text-sm text-muted-foreground">{resetMsg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
