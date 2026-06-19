"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNTS, isDemoLoginEnabled } from "@/lib/demo-accounts";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const demoEnabled = isDemoLoginEnabled();

  async function doLogin(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("邮箱或密码错误");
      return false;
    }
    router.push("/dashboard");
    router.refresh();
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  async function handleDemoLogin(role: UserRole) {
    const account = DEMO_ACCOUNTS.find((a) => a.role === role);
    if (!account) return;
    setSelectedRole(role);
    setEmail(account.email);
    setPassword(account.password);
    await doLogin(account.email, account.password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>培安 CRM 登录</CardTitle>
          <p className="text-sm text-muted-foreground">医院软件 CRM + 项目管理系统</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSelectedRole(null);
                }}
                placeholder="admin@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSelectedRole(null);
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
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">测试快捷登录</p>
              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <label
                    key={account.role}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                      selectedRole === account.role
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50",
                      loading && "pointer-events-none opacity-60"
                    )}
                  >
                    <input
                      type="radio"
                      name="demo-role"
                      value={account.role}
                      checked={selectedRole === account.role}
                      onChange={() => handleDemoLogin(account.role)}
                      className="h-4 w-4 accent-primary"
                      disabled={loading}
                    />
                    <span className="flex-1 text-sm">
                      <span className="font-medium">{account.label}</span>
                      <span className="ml-2 text-muted-foreground">{account.email}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                勾选角色后将自动登录（仅开发环境显示）
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
