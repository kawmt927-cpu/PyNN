"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNTS, isDemoLoginEnabled, SALES_QUICK_LOGIN } from "@/lib/demo-accounts";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { WeComLoginSection } from "@/components/auth/wecom-login-section";

type Props = {
  returnTo: string;
  forceMobileUi?: boolean;
  wecomError?: string | null;
};

export function LoginForm({ returnTo, forceMobileUi = false, wecomError = null }: Props) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [selectedSalesPhone, setSelectedSalesPhone] = useState<string | null>(null);
  const demoEnabled = isDemoLoginEnabled();

  async function doLogin(loginPhone: string, loginPassword: string) {
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      phone: loginPhone,
      password: loginPassword,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("手机号或密码错误，或账号尚未激活");
      return false;
    }
    if (forceMobileUi) {
      try {
        await fetch("/api/ui-mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "mobile" }),
        });
      } catch {
        // 忽略；中间件仍会按 UA 纠偏
      }
    }
    router.push(returnTo);
    router.refresh();
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(phone, password);
  }

  async function handleSalesQuickLogin(salesPhone: string, salesPassword: string) {
    setSelectedRole(null);
    setSelectedSalesPhone(salesPhone);
    setPhone(salesPhone);
    setPassword(salesPassword);
    await doLogin(salesPhone, salesPassword);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>培安 CRM 登录</CardTitle>
          <p className="text-sm text-muted-foreground">医院软件 CRM + 项目管理系统</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setSelectedRole(null);
                  setSelectedSalesPhone(null);
                }}
                placeholder="11 位手机号"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSelectedRole(null);
                  setSelectedSalesPhone(null);
                }}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中…" : "登录"}
            </Button>
          </form>

          {demoEnabled && (
            <>
              {SALES_QUICK_LOGIN.length > 0 ? (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground">销售快捷登录（演示）</p>
                  <div className="grid grid-cols-3 gap-2">
                    {SALES_QUICK_LOGIN.map((account) => (
                      <Button
                        key={account.phone}
                        type="button"
                        variant={selectedSalesPhone === account.phone ? "default" : "outline"}
                        className="h-auto flex-col gap-0.5 py-3 text-sm"
                        disabled={loading}
                        onClick={() => handleSalesQuickLogin(account.phone, account.password)}
                      >
                        <span className="font-medium">{account.label}</span>
                        <span className="text-xs font-normal opacity-80">sales123</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground">管理员快捷登录（开发）</p>
                <div className="space-y-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <label
                      key={account.phone}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                        selectedSalesPhone === account.phone
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50",
                        loading && "pointer-events-none opacity-60"
                      )}
                    >
                      <input
                        type="radio"
                        name="demo-role"
                        value={account.phone}
                        checked={selectedSalesPhone === account.phone}
                        onChange={() => {
                          setSelectedRole(account.role);
                          void handleSalesQuickLogin(account.phone, account.password);
                        }}
                        className="h-4 w-4 accent-primary"
                        disabled={loading}
                      />
                      <span className="flex-1 text-sm">
                        <span className="font-medium">{account.label}</span>
                        <span className="ml-2 text-muted-foreground">{account.phone}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  其余人员为企微待激活账号；勾选后将自动登录（仅开发环境显示）
                </p>
              </div>
            </>
          )}

          <WeComLoginSection returnTo={returnTo} error={wecomError} />
        </CardContent>
      </Card>
    </div>
  );
}
