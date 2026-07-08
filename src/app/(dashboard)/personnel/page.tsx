import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonnelListTable } from "@/components/personnel/personnel-list-table";
import { getPersonAllocationSplit } from "@/lib/projects/cost-summary";
import { getWeekRange } from "@/lib/projects/week-range";

export default async function PersonnelPage() {
  await requireRole(["PROJECT_ADMIN", "ADMIN"]);

  const week = getWeekRange();
  const users = await prisma.user.findMany({
    where: {
      personnelProfile: {
        staffCategory: "IMPLEMENTATION",
        enabled: true,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      personnelProfile: {
        select: { personnelType: true, dailyRate: true },
      },
      staffAllocations: {
        select: { projectId: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const items = await Promise.all(
    users.map(async (user) => {
      const { totalDays, totalCost } = await getPersonAllocationSplit(user.id, week);
      const projectCount = new Set(user.staffAllocations.map((a) => a.projectId)).size;
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        personnelType: user.personnelProfile?.personnelType ?? null,
        dailyRate: user.personnelProfile?.dailyRate
          ? Number(user.personnelProfile.dailyRate)
          : null,
        projectCount,
        weekEffectiveDays: totalDays,
        weekCost: totalCost,
      };
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">实施人员</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            人员列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({items.length} 人 · 本周人天按 AUTO 等比例实时计算)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PersonnelListTable items={items} />
        </CardContent>
      </Card>
    </div>
  );
}
