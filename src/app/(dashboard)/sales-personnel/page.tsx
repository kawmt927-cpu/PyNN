import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesPersonnelTable } from "@/components/sales-personnel/sales-personnel-table";
import { SALES_FUNCTION_ROLES } from "@/lib/sales/team-performance";

const ROLE_RANK: Record<string, number> = {
  ADMIN: 0,
  SALES_MANAGER: 1,
  SALES: 2,
};

export default async function SalesPersonnelPage() {
  await requireRole(["SALES_MANAGER", "ADMIN"]);

  const users = await prisma.user.findMany({
    where: { role: { in: SALES_FUNCTION_ROLES } },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      includeInTeamPerformance: true,
      includeInMonthlyAssessment: true,
      personnelProfile: { select: { enabled: true } },
    },
  });

  const items = users
    .map((u) => ({
      userId: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      role: u.role,
      enabled: u.personnelProfile?.enabled ?? false,
      includeInTeamPerformance: u.includeInTeamPerformance,
      includeInMonthlyAssessment: u.includeInMonthlyAssessment,
    }))
    .sort((a, b) => {
      // 启用在前，停用/无档案在后
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      // 权限从高到低：管理员 > 销售管理 > 销售
      const rankDiff = (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name, "zh");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>销售人员</CardTitle>
      </CardHeader>
      <CardContent>
        <SalesPersonnelTable items={items} />
      </CardContent>
    </Card>
  );
}
