import { requireSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { getNavForRoleAsync } from "@/lib/rbac/has-permission";
import { applySidebarNavOrder, parseSidebarNavOrder } from "@/lib/nav/sidebar-order";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarNavOrderSettings } from "@/components/account/sidebar-nav-order-settings";

/** 个人设置：账号信息 + 侧栏顺序自定义 */
export default async function AccountPage() {
  const session = await requireSession();
  const [user, nav] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { sidebarNavOrder: true },
    }),
    getNavForRoleAsync(session.user.role),
  ]);

  const savedOrder = parseSidebarNavOrder(user?.sidebarNavOrder);
  const orderedNav = applySidebarNavOrder(nav, savedOrder);
  const isOther = session.user.role === "OTHER";

  return (
    <div className="mx-auto max-w-lg space-y-6 py-2">
      <Card>
        <CardHeader>
          <CardTitle>个人设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            你好，{session.user.name}（{ROLE_LABELS[session.user.role]}）。
          </p>
          {isOther ? (
            <>
              <p>
                当前角色仅用于人员成本（日单价 / 月成本）核算，不开放客户、商机、项目等业务模块。
              </p>
              <p>如需开通业务权限，请联系系统管理员调整角色。</p>
            </>
          ) : (
            <p>可在此调整个人侧栏入口顺序；系统角色与业务权限由管理员配置。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <SidebarNavOrderSettings
            items={orderedNav.map((item) => ({ id: item.id, label: item.label }))}
            hasCustomOrder={Boolean(savedOrder)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
