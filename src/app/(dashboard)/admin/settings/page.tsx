import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { bindWeComUser, unbindWeComUser } from "./actions";
import { getWeComConfigForAdmin } from "@/lib/wecom/config";
import { listPendingWeComAccessRequests } from "@/lib/wecom/access-request";
import { WeComAccessRequestsPanel } from "@/components/admin/wecom-access-requests-panel";
import { WeComIntegrationOverview } from "@/components/admin/wecom-integration-overview";
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
import { SalesLogPromptSettings } from "@/components/admin/sales-log-prompt-settings";
import { AmapSettings } from "@/components/admin/amap-settings";
import { UnbindWecomButton } from "@/components/admin/unbind-wecom-button";
import { KpiSettings } from "@/components/admin/kpi-settings";
import { ProductTemplatesPanel } from "@/components/admin/product-templates-panel";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { getAiAgentConfigForAdmin, getSalesLogPromptSettings } from "@/lib/agent/config";
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

  const [users, optionsByCategory, aiAgentConfig, salesLogPrompt, amapConfig, productTemplates, wecomAccessRequests] =
    await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, wecomUserId: true },
    }),
    getAllConfigOptionsGrouped(),
    role === "ADMIN" ? getAiAgentConfigForAdmin() : Promise.resolve(null),
    activeTab === SETTINGS_TAB.SALES_LOG ? getSalesLogPromptSettings() : Promise.resolve(null),
    role === "ADMIN" ? getAmapConfigForAdmin() : Promise.resolve(null),
    activeTab === SETTINGS_TAB.PRODUCTS
      ? prisma.productServiceTemplate.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    activeTab === SETTINGS_TAB.WECOM && role === "ADMIN"
      ? listPendingWeComAccessRequests()
      : Promise.resolve([]),
  ]);

  const wecomConfig = getWeComConfigForAdmin();

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
      ) : activeTab === SETTINGS_TAB.PRODUCTS ? (
        <Card>
          <CardHeader>
            <CardTitle>产品服务模板</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              维护合同签约时可选择的产品及默认成本；合同售价以合同金额为准。
            </p>
            <ProductTemplatesPanel
              items={productTemplates.map((row) => ({
                id: row.id,
                name: row.name,
                description: row.description,
                baselineCostPrice: Number(row.baselineCostPrice),
                enabled: row.enabled,
              }))}
            />
          </CardContent>
        </Card>
      ) : activeTab === SETTINGS_TAB.KPI ? (
        <Card>
          <CardHeader>
            <CardTitle>KPI 设置</CardTitle>
          </CardHeader>
          <CardContent>
            <KpiSettings />
          </CardContent>
        </Card>
      ) : activeTab === SETTINGS_TAB.SALES_LOG && salesLogPrompt ? (
        <Card>
          <CardHeader>
            <CardTitle>日志助手 Prompt</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesLogPromptSettings
              initial={salesLogPrompt}
              showAiSettingsLink={role === "ADMIN"}
            />
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
                将 CRM 嵌入企业微信工作台，支持手机与 PC 客户端内打开、PC 浏览器扫码登录。
              </p>
              <WeComIntegrationOverview config={wecomConfig} />
              <div className="rounded-md bg-muted p-3 text-xs leading-relaxed">
                <p className="font-medium text-foreground">应用主页（推荐）</p>
                <code className="mt-1 block break-all">
                  https://你的域名/today-work
                </code>
                <p className="mt-3 font-medium text-foreground">销售日志 H5（可选二级入口）</p>
                <code className="mt-1 block break-all">https://你的域名/mobile/log</code>
              </div>
              <p className="text-muted-foreground">
                <strong>可信域名</strong>、<strong>OAuth 回调域</strong>、<strong>JS 接口安全域名</strong>
                均填写 CRM 域名。PC 浏览器登录使用「登录页 → 企业微信扫码」。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                企微开通申请
                {wecomAccessRequests.length > 0 ? (
                  <span className="ml-2 text-sm font-normal text-amber-600">
                    {wecomAccessRequests.length} 条待审批
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeComAccessRequestsPanel
                requests={wecomAccessRequests.map((r) => ({
                  ...r,
                  createdAt: r.createdAt.toISOString(),
                }))}
                usersWithoutWecom={users
                  .filter((u) => !u.wecomUserId)
                  .map((u) => ({ id: u.id, name: u.name, email: u.email }))}
              />
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
                            <UnbindWecomButton
                              userId={u.id}
                              userName={u.name}
                              fieldName="userId"
                              label="解绑"
                              action={unbindWeComUser}
                            />
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
