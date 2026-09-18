import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_ACCEPTANCE_RESULT_LABELS,
  PROJECT_CHANGE_REQUEST_STATUS_LABELS,
} from "@/lib/presales/labels";
import {
  createProjectAcceptance,
  createProjectChangeRequest,
  reviewProjectChangeRequest,
  submitProjectChangeRequest,
} from "@/app/(dashboard)/projects/delivery-actions";
import type {
  ProjectAcceptanceResult,
  ProjectChangeRequestStatus,
} from "@prisma/client";

export type AcceptanceRow = {
  id: string;
  acceptedAt: Date;
  result: ProjectAcceptanceResult;
  notes: string | null;
  createdAt: Date;
  createdBy: { name: string };
};

export type ChangeRequestRow = {
  id: string;
  title: string;
  description: string | null;
  impact: string | null;
  status: ProjectChangeRequestStatus;
  createdAt: Date;
  requester: { id: string; name: string };
  reviewer: { name: string } | null;
};

type Props = {
  projectId: string;
  canEdit: boolean;
  canReview: boolean;
  currentUserId: string;
  acceptances: AcceptanceRow[];
  changeRequests: ChangeRequestRow[];
};

export function ProjectDeliveryPanel({
  projectId,
  canEdit,
  canReview,
  currentUserId,
  acceptances,
  changeRequests,
}: Props) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-semibold">验收记录</h3>
        {canEdit ? (
          <form
            action={createProjectAcceptance}
            className="grid gap-3 rounded-md border p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <div className="space-y-1.5">
              <Label htmlFor="acceptedAt">验收日期</Label>
              <Input
                id="acceptedAt"
                name="acceptedAt"
                type="date"
                defaultValue={format(new Date(), "yyyy-MM-dd")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="result">结论</Label>
              <select
                id="result"
                name="result"
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="PASSED"
              >
                <option value="PASSED">通过</option>
                <option value="FAILED">未通过</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="acceptance-notes">备注</Label>
              <Textarea id="acceptance-notes" name="notes" rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm">
                登记验收
              </Button>
            </div>
          </form>
        ) : null}
        {acceptances.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无验收记录</p>
        ) : (
          <ul className="space-y-2">
            {acceptances.map((row) => (
              <li key={row.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="font-medium">
                    {PROJECT_ACCEPTANCE_RESULT_LABELS[row.result]}
                  </span>
                  <span className="text-muted-foreground">
                    {format(row.acceptedAt, "yyyy-MM-dd")} · {row.createdBy.name}
                  </span>
                </div>
                {row.notes ? <p className="mt-1 text-muted-foreground">{row.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">变更请求</h3>
        {canEdit ? (
          <form
            action={createProjectChangeRequest}
            className="grid gap-3 rounded-md border p-4"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <div className="space-y-1.5">
              <Label htmlFor="cr-title">标题</Label>
              <Input id="cr-title" name="title" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-desc">说明</Label>
              <Textarea id="cr-desc" name="description" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-impact">影响（工期/范围等）</Label>
              <Input id="cr-impact" name="impact" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="submitNow" value="true" defaultChecked />
              创建后直接提交审批
            </label>
            <Button type="submit" size="sm">
              新建变更单
            </Button>
          </form>
        ) : null}
        {changeRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无变更单</p>
        ) : (
          <ul className="space-y-2">
            {changeRequests.map((row) => (
              <li key={row.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.title}</span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">
                    {PROJECT_CHANGE_REQUEST_STATUS_LABELS[row.status]}
                  </span>
                  <span className="text-muted-foreground">
                    {row.requester.name} · {format(row.createdAt, "yyyy-MM-dd")}
                  </span>
                </div>
                {row.description ? <p className="mt-1">{row.description}</p> : null}
                {row.impact ? (
                  <p className="mt-1 text-muted-foreground">影响：{row.impact}</p>
                ) : null}
                {row.reviewer ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    审批人：{row.reviewer.name}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.status === "DRAFT" &&
                  (row.requester.id === currentUserId || canReview) ? (
                    <form action={submitProjectChangeRequest}>
                      <input type="hidden" name="changeRequestId" value={row.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        提交审批
                      </Button>
                    </form>
                  ) : null}
                  {row.status === "SUBMITTED" && canReview ? (
                    <>
                      <form action={reviewProjectChangeRequest}>
                        <input type="hidden" name="changeRequestId" value={row.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <Button type="submit" size="sm">
                          通过
                        </Button>
                      </form>
                      <form action={reviewProjectChangeRequest}>
                        <input type="hidden" name="changeRequestId" value={row.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <Button type="submit" size="sm" variant="outline">
                          驳回
                        </Button>
                      </form>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
