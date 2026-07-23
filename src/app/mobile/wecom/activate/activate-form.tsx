"use client";

import { useState, useTransition } from "react";
import { activateWeComUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  wecomUserId: string;
  name: string;
  roleLabel: string;
};

export function WeComActivateForm({ wecomUserId, name, roleLabel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await activateWeComUser(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="wecomUserId" value={wecomUserId} />
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <p>
          <span className="text-muted-foreground">姓名：</span>
          {name}
        </p>
        <p className="mt-1">
          <span className="text-muted-foreground">角色：</span>
          {roleLabel}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">手机号（登录账号）</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          required
          placeholder="11 位手机号"
          pattern="1[3-9]\d{9}"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">设置密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirm">确认密码</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "提交中…" : "完成激活并进入系统"}
      </Button>
    </form>
  );
}
