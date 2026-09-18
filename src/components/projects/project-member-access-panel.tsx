"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectMemberAccess } from "@prisma/client";
import { ToneSelect } from "@/components/ui/select-field";
import { FormSuccessMessage } from "@/components/ui/form-success-message";
import {
  PROJECT_MEMBER_ACCESS_LABELS,
} from "@/lib/projects/access";
import { updateProjectMemberAccess } from "@/app/(dashboard)/projects/member-access-actions";

export type ProjectAccessCandidate = {
  userId: string;
  name: string;
  accessLevel: ProjectMemberAccess;
  sources: string[];
};

const ACCESS_OPTIONS = (Object.keys(PROJECT_MEMBER_ACCESS_LABELS) as ProjectMemberAccess[]).map(
  (value) => ({
    value,
    label: PROJECT_MEMBER_ACCESS_LABELS[value],
  })
);

type Props = {
  projectId: string;
  candidates: ProjectAccessCandidate[];
};

export function ProjectMemberAccessPanel({ projectId, candidates }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [levels, setLevels] = useState<Record<string, ProjectMemberAccess>>(() =>
    Object.fromEntries(candidates.map((c) => [c.userId, c.accessLevel]))
  );

  function setAccess(userId: string, accessLevel: ProjectMemberAccess) {
    setError(null);
    setSuccess(null);
    const prev = levels[userId];
    setLevels((m) => ({ ...m, [userId]: accessLevel }));
    setPendingUserId(userId);
    startTransition(async () => {
      const result = await updateProjectMemberAccess({
        projectId,
        userId,
        accessLevel,
      });
      setPendingUserId(null);
      if (result.error) {
        setLevels((m) => ({ ...m, [userId]: prev }));
        setError(result.error);
        return;
      }
      setSuccess("访问权限已更新");
      router.refresh();
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        暂无候选人。给任务指定负责人或加入排班后，可在此授予查看/编辑权限。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        默认不可打开项目页。仅「可查看 / 可编辑」可进入；被指派任务的人仍可在「计划与任务」更新自己的状态。
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <FormSuccessMessage message={success} onClear={() => setSuccess(null)} />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">人员</th>
              <th className="px-3 py-2 font-medium">来源</th>
              <th className="px-3 py-2 font-medium">访问权限</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((row) => {
              const busy = pending && pendingUserId === row.userId;
              return (
                <tr key={row.userId} className="border-b">
                  <td className="px-3 py-2.5 font-medium">{row.name}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {row.sources.join(" · ")}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="w-[8.5rem]">
                      <ToneSelect
                        size="sm"
                        value={levels[row.userId] ?? row.accessLevel}
                        disabled={busy}
                        onValueChange={(value) =>
                          setAccess(row.userId, value as ProjectMemberAccess)
                        }
                        options={ACCESS_OPTIONS}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
