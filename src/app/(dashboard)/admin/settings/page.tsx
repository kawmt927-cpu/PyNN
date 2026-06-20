import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { bindWeComUser, unbindWeComUser } from "./actions";
import { isWeComConfigured } from "@/lib/wecom/config";
import { getAllConfigOptionsGrouped } from "@/lib/config-options";
import {
  canAccessSettingsTab,
  getAccessibleConfigModules,
  getAccessibleSettingsTabs,
  requireSettingsPageAccess,
  resolveAccessibleConfigField,
  SETTINGS_TAB,
} from "@/lib/config-settings-access";
import { ConfigFieldsSettings } from "@/components/admin/config-fields-settings";
import { AiAgentSettings } from "@/components/admin/ai-agent-settings";
import { AmapSettings } from "@/components/admin/amap-settings";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { getAiAgentConfigForAdmin } from "@/lib/agent/config";
import { getAmapConfigForAdmin } from "@/lib/amap/config";

type Props = {
  searchParams: Promise<{ tab?: string; module?: string; field?: string }>;
};

export default async function AdminSettingsPage({ searchParams }: Props) {
  const session = await requireSettingsPageAccess();
  const role = session.user.role;
  const { tab: rawTab, module: rawModule, field: rawField } = await searchParams;

  const accessibleModules = getAccessibleConfigModules(role);
  const accessibleTabs = getAccessibleSettingsTabs(role);

  if (accessibleTabs.length === 0) redirect("/");

  const activeTab = canAccessSettingsTab(role, rawTab ?? SETTINGS_TAB.FIELDS)
    ? (rawTab ?? accessibleTabs[0].id)
    : accessibleTabs[0].id;

  const { module: defaultModule, field: defaultField } = resolveAccessibleConfigField(
    accessibleModules,
    rawModule,
    rawField
  );

  const [users, optionsByCategory, aiAgentConfig, amapConfig] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, wecomUserId: true },
    }),
    getAllConfigOptionsGrouped(),
    role === "ADMIN" ? getAiAgentConfigForAdmin() : Promise.resolve(null),
    role === "ADMIN" ? getAmapConfigForAdmin() : Promise.resolve(null),
  ]);

  const wecomReady = isWeComConfigured();

  const settingsTabs = accessibleTabs.map((tab) => ({
    ...tab,
    href: `/admin/settings?tab=${tab.id}`,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">系统配置</h1>

      <SettingsTabs activeTab={activeTab} tabs={settingsTabs} />

      {activeTab === SETTINGS_TAB.FIELDS ? (
        <Card>
          <CardHeader>
            <CardTitle>字段选项配置</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<p className="text-sm text-muted-foreground">加载中…</p>}>
              <ConfigFieldsSettings
                modules={accessibleModules}
                optionsByCategory={optionsByCategory}
                initialModule={defaultModule?.id}
                initialField={defaultField?.category}
              />
            </Suspense>
          </CardContent>
        </Card>
      ) : activeTab === SETTINGS_TAB.AI && aiAgentConfig ? (
        <Card>
          <CardHeader>
            <CardTitle>AI 助手（Kimi Agent）</CardTitle>
          </CardHeader>
          <CardContent>
            <AiAgentSettings initial={aiAgentConfig} />
          </CardContent>
        </Card>
      ) : activeTab === SETTINGS_TAB.AMAP && amapConfig ? (
        <Card>
          <CardHeader>
            <CardTitle>打卡定位（高德地图）</CardTitle>
          </CardHeader>
          <CardContent>
            <AmapSettings initial={amapConfig} />
          </CardContent>
        </Card>
      ) : activeTab === SETTINGS_TAB.WECOM ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>企业微信</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                应用主页建议配置为：
                <code className="rounded bg-muted px-1">https://你的域名/mobile/log</code>
              </p>
              <p>
                配置状态：
                <span className={wecomReady ? "text-green-600" : "text-orange-600"}>
                  {wecomReady ? "已配置环境变量" : "未配置 WECOM_* 环境变量"}
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>企业微信账号绑定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={bindWeComUser} className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="userId">CRM 用户</Label>
                  <select
                    id="userId"
                    name="userId"
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">请选择</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wecomUserId">企业微信 UserID</Label>
                  <Input id="wecomUserId" name="wecomUserId" placeholder="如 ZhangSan" required />
                </div>
                <div className="flex items-end">
                  <Button type="submit">绑定</Button>
                </div>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4">姓名</th>
                      <th className="pb-2 pr-4">邮箱</th>
                      <th className="pb-2 pr-4">企微 UserID</th>
                      <th className="pb-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b">
                        <td className="py-3 pr-4">{u.name}</td>
                        <td className="py-3 pr-4">{u.email}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{u.wecomUserId ?? "—"}</td>
                        <td className="py-3">
                          {u.wecomUserId && (
                            <form action={unbindWeComUser}>
                              <input type="hidden" name="userId" value={u.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                解绑
                              </Button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
