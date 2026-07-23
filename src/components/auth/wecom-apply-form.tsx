"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyWeComAccess } from "@/app/mobile/wecom/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  wecomUserId: string;
  defaultName?: string;
  defaultPhone?: string;
};

export function WeComApplyForm({ wecomUserId, defaultName = "", defaultPhone = "" }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await applyWeComAccess(formData);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "提交失败");
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="wecomUserId" value={wecomUserId} />
      <div className="space-y-2">
        <Label htmlFor="name">姓名</Label>
        <Input id="name" name="name" defaultValue={defaultName} required placeholder="您的姓名" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">手机号（登录账号）</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          defaultValue={defaultPhone}
          required
          placeholder="11 位手机号"
          pattern="1[3-9]\d{9}"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">登录密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="至少 6 位"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirm">确认密码</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="再次输入密码"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">备注（选填）</Label>
        <Textarea id="message" name="message" rows={2} placeholder="如所属部门、申请原因" />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "提交中…" : "提交开通申请"}
      </Button>
    </form>
  );
}
