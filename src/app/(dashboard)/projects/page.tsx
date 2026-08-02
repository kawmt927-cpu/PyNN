import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectListTable } from "@/components/projects/project-list-table";
import {
  buildProjectListWhere,
  canAccessResourceSchedule,
  canCreateProject,
} from "@/lib/projects/access";
import { attachCostsToProjectList } from "@/lib/projects/cost-summary";

export default async function ProjectsPage() {
  const session = await requireRole([
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "ADMIN",
  ]);

  const where = buildProjectListWhere(session.user.role, session.user.id);
  const canCreate = canCreateProject(session.user.role);
  const canSchedule = canAccessResourceSchedule(session.user.role);
  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      projectManager: { select: { name: true } },
      contract: { select: { totalAmount: true } },
    },
    take: 200,
  });

  const items = await attachCostsToProjectList(projects);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">项目管理</h1>
        <div className="flex flex-wrap gap-2">
          {canCreate ? (
            <Button asChild>
              <Link href="/projects/new">新建项目</Link>
            </Button>
          ) : null}
          {canSchedule ? (
            <Button asChild variant={canCreate ? "outline" : "default"}>
              <Link href="/projects/schedule">资源排班</Link>
            </Button>
          ) : null}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            项目列表
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({items.length} 个)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground">
              暂无项目。
              {canCreate
                ? "请点击「新建项目」；合同与客户均可选，都不填即为内部项目。"
                : null}
            </p>
          ) : (
            <ProjectListTable items={items} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
