import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/components/navigation/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectCreateForm } from "@/components/projects/project-create-form";
import { canCreateProject } from "@/lib/projects/access";
import { resolveBackNavigation } from "@/lib/navigation/return-to";
import { redirect } from "next/navigation";

const LINKABLE_STATUSES = [
  "SIGNED_PENDING_IMPL",
  "IMPLEMENTING",
  "ACCEPTED",
  "MAINTAINING",
] as const;

type Props = {
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function NewProjectPage({ searchParams }: Props) {
  const query = await searchParams;
  const session = await requireRole(["ADMIN", "PROJECT_ADMIN"]);
  if (!canCreateProject(session.user.role)) {
    redirect("/projects");
  }

  const { backHref, backLabel } = resolveBackNavigation(query, "/projects");

  const linkableContracts = await prisma.contract.findMany({
    where: {
      project: null,
      status: { in: [...LINKABLE_STATUSES] },
    },
    orderBy: { signedAt: "desc" },
    take: 300,
    select: {
      id: true,
      title: true,
      contractNo: true,
      endUserCustomerId: true,
      endUserCustomer: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">新建项目</h1>
        <BackLink href={backHref} label={backLabel} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">项目信息</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            合同与客户均可选填；都不填时作为内部/独立项目，后续计划与排班流程不变。
          </p>
          <ProjectCreateForm
            linkableContracts={linkableContracts.map((c) => ({
              id: c.id,
              title: c.title,
              contractNo: c.contractNo,
              endUserCustomerId: c.endUserCustomerId,
              endUserCustomerName: c.endUserCustomer.name,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
