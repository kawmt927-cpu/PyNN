import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PHASE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
} from "@/lib/projects/labels";
import { withReturnTo } from "@/lib/navigation/return-to";
import type { PhaseStatus, ProjectStatus } from "@prisma/client";

type PhaseRow = {
  id: string;
  name: string;
  status: PhaseStatus;
};

type Props = {
  returnTo: string;
  canCreateProject: boolean;
  /** 可进 /projects/[id] 的角色才显示「打开项目」 */
  canOpenProjectPage: boolean;
  project: {
    id: string;
    name: string;
    status: ProjectStatus;
    progressPercent: number;
    phases: PhaseRow[];
  } | null;
  createProjectHref: string;
};

export function ContractProjectPanel({
  returnTo,
  canCreateProject,
  canOpenProjectPage,
  project,
  createProjectHref,
}: Props) {
  if (project) {
    const currentPhase =
      project.phases.find((p) => p.status === "IN_PROGRESS") ||
      project.phases.filter((p) => p.status === "COMPLETED").at(-1) ||
      project.phases[0] ||
      null;

    return (
      <Card id="contract-project">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">已关联项目</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              合同状态随项目推进；阶段完成后会提醒销管催收或准备沟通。
            </p>
          </div>
          {canOpenProjectPage ? (
            <Button asChild size="sm" variant="outline">
              <Link href={withReturnTo(`/projects/${project.id}`, returnTo)}>打开项目</Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <p>
              <span className="text-muted-foreground">项目：</span>
              {project.name}
            </p>
            <p>
              <span className="text-muted-foreground">状态：</span>
              {PROJECT_STATUS_LABELS[project.status]}
            </p>
            <p>
              <span className="text-muted-foreground">进度：</span>
              {Math.round(project.progressPercent)}%
            </p>
            {currentPhase ? (
              <p>
                <span className="text-muted-foreground">当前阶段：</span>
                {currentPhase.name}
                <span className="text-muted-foreground">
                  （{PHASE_STATUS_LABELS[currentPhase.status]}）
                </span>
              </p>
            ) : null}
          </div>
          {project.phases.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {project.phases.map((phase) => (
                <li
                  key={phase.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span>{phase.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {PHASE_STATUS_LABELS[phase.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              尚未配置阶段。请在项目中套用模型或添加阶段，并将回款分期绑定阶段后，完成阶段即可触发催收提醒。
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="contract-project">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">无关联项目</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            本项目合同尚未关联实施/维保项目。需要交付与阶段催收时，可由项目管理员建项并关联。
          </p>
        </div>
        {canCreateProject ? (
          <Button asChild size="sm">
            <Link href={createProjectHref}>为此合同建项</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {canCreateProject
          ? "建项后请配置阶段计划，并在下方回款进度中将分期绑定对应阶段。"
          : "销售管理可在此查看是否已关联；建项请由项目管理员或管理员操作。"}
      </CardContent>
    </Card>
  );
}
