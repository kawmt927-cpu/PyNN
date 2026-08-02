"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWeeklyAssignmentDialog } from "@/components/plans-tasks/create-weekly-assignment-dialog";
import {
  weeklyAssignmentFollowUpHref,
  assignmentStatusLabel,
  assignmentKindLabel,
  type WeeklyAssignmentListItem,
} from "@/lib/today-work/weekly-assignments";
import { getRemainingTimeInfo, remainingTimeClassName } from "@/lib/today-work/remaining-time";
import { CancelWeeklyAssignmentButton } from "@/components/today-work/cancel-weekly-assignment-button";
import { GeneralAssignmentActionButton } from "@/components/today-work/general-assignment-action-button";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";

type AssignmentRow = WeeklyAssignmentListItem & {
  followUp?: {
    nextFollowUpMethod: string | null;
    contact: { name: string } | null;
  } | null;
};

type SalesUser = { id: string; name: string };

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function taskEntityLabel(task: {
  kind: string;
  title: string;
  customer: { name: string } | null;
  opportunity: { title: string } | null;
}) {
  if (task.kind === "GENERAL") return task.title;
  return task.customer?.name ?? task.opportunity?.title ?? "—";
}

function taskMetaParts(row: {
  followUp?: {
    nextFollowUpMethod: string | null;
    contact: { name: string } | null;
  } | null;
}) {
  const parts: string[] = [];
  if (row.followUp?.contact?.name) parts.push(row.followUp.contact.name);
  if (row.followUp?.nextFollowUpMethod) {
    parts.push(
      FOLLOW_UP_METHOD_LABELS[
        row.followUp.nextFollowUpMethod as keyof typeof FOLLOW_UP_METHOD_LABELS
      ] ?? row.followUp.nextFollowUpMethod
    );
  }
  return parts;
}

function taskSecondaryMeta(task: AssignmentRow) {
  const parts = taskMetaParts(task);
  if (task.kind === "GENERAL") {
    parts.unshift(assignmentKindLabel(task.kind));
  }
  parts.push(`截止 ${format(toDate(task.dueAt), "yyyy-MM-dd HH:mm")}`);
  return parts.join(" · ");
}

function assignmentProgressTitle(label: string, items: Array<{ status: string }>) {
  const total = items.length;
  const completed = items.filter((item) => item.status === "COMPLETED").length;
  return `${label}（${completed}/${total}）`;
}

function isOpenStatus(status: string) {
  return status === "PENDING" || status === "PENDING_CONFIRM";
}

function ShowCompletedCheckbox({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      <span>显示已完成</span>
    </label>
  );
}

export function AssignmentsManagerListClient({
  assignments,
  salesUsers,
  userId,
}: {
  assignments: AssignmentRow[];
  salesUsers: SalesUser[];
  userId: string;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const now = useMemo(() => new Date(), []);
  const visible = showCompleted
    ? assignments
    : assignments.filter((row) => row.status !== "COMPLETED");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{assignmentProgressTitle("全部任务", assignments)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            管理员指派的全部任务，按截止时间由近到远排序。含客户跟进与普通任务。
          </p>
          <ShowCompletedCheckbox
            id="plans-tasks-show-completed-manager"
            checked={showCompleted}
            onChange={setShowCompleted}
          />
        </div>
        <CreateWeeklyAssignmentDialog salesUsers={salesUsers} />
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无任务。可点击「新建指派任务」创建。</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无未完成任务。勾选「显示已完成」可查看历史任务。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">任务</th>
                  <th className="pb-2 pr-4">类型</th>
                  <th className="pb-2 pr-4">客户/商机</th>
                  <th className="pb-2 pr-4">指派给</th>
                  <th className="pb-2 pr-4">截止</th>
                  <th className="pb-2 pr-4">剩余</th>
                  <th className="pb-2 pr-4">状态</th>
                  <th className="pb-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const dueAt = toDate(row.dueAt);
                  const remaining = isOpenStatus(row.status)
                    ? getRemainingTimeInfo(dueAt, now)
                    : null;
                  const canMarkDone =
                    row.kind === "GENERAL" &&
                    row.status === "PENDING" &&
                    row.assigneeId === userId;
                  const canConfirm =
                    row.kind === "GENERAL" &&
                    row.status === "PENDING_CONFIRM" &&
                    row.createdById === userId;
                  return (
                    <tr key={row.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">{row.title}</td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        {assignmentKindLabel(row.kind)}
                      </td>
                      <td className="py-3 pr-4">
                        <div>
                          {row.opportunity ? (
                            <Link
                              href={`/opportunities/${row.opportunity.id}`}
                              className="text-primary hover:underline"
                            >
                              {row.opportunity.title}
                            </Link>
                          ) : row.customer ? (
                            <Link
                              href={`/customers/${row.customer.id}`}
                              className="text-primary hover:underline"
                            >
                              {row.customer.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </div>
                        {taskMetaParts(row).length > 0 ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {taskMetaParts(row).join(" · ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        <div>{row.assignee.name}</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          由 {row.createdBy.name} 指派
                        </p>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        {format(dueAt, "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="py-3 pr-4">
                        {remaining ? (
                          <span className={remainingTimeClassName(remaining.tone)}>
                            {remaining.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {assignmentStatusLabel(row.status)}
                        {row.assigneeNote && row.status === "PENDING_CONFIRM" ? (
                          <p className="mt-0.5 max-w-[10rem] text-xs text-muted-foreground line-clamp-2">
                            {row.assigneeNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {canMarkDone ? (
                            <GeneralAssignmentActionButton
                              assignmentId={row.id}
                              mode="mark_done"
                            />
                          ) : null}
                          {canConfirm ? (
                            <>
                              <GeneralAssignmentActionButton
                                assignmentId={row.id}
                                mode="confirm"
                              />
                              <GeneralAssignmentActionButton
                                assignmentId={row.id}
                                mode="reject"
                              />
                            </>
                          ) : null}
                          {isOpenStatus(row.status) ? (
                            <CancelWeeklyAssignmentButton id={row.id} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AssignmentsUserListClient({
  tasks,
  userId,
  returnPath,
}: {
  tasks: AssignmentRow[];
  userId: string;
  returnPath: string;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const now = useMemo(() => new Date(), []);
  const visible = showCompleted
    ? tasks
    : tasks.filter((row) => row.status !== "COMPLETED");

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle>{assignmentProgressTitle("我的任务", tasks)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          指派给我或我创建的任务，按截止时间由近到远排序。普通任务完成后需指派人确认。
        </p>
        <ShowCompletedCheckbox
          id="plans-tasks-show-completed-user"
          checked={showCompleted}
          onChange={setShowCompleted}
        />
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无指派任务。</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无未完成任务。勾选「显示已完成」可查看历史任务。
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((task) => {
              const dueAt = toDate(task.dueAt);
              const remaining = isOpenStatus(task.status)
                ? getRemainingTimeInfo(dueAt, now)
                : null;
              const href =
                task.status === "PENDING" && task.kind !== "GENERAL"
                  ? weeklyAssignmentFollowUpHref(task, returnPath)
                  : null;
              const canMarkDone =
                task.kind === "GENERAL" &&
                task.status === "PENDING" &&
                task.assigneeId === userId;
              const canConfirm =
                task.kind === "GENERAL" &&
                task.status === "PENDING_CONFIRM" &&
                task.createdById === userId;
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{taskEntityLabel(task)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {task.kind === "GENERAL" ? null : (
                        <p className="text-sm text-muted-foreground">{task.title}</p>
                      )}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {assignmentKindLabel(task.kind)}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {assignmentStatusLabel(task.status)}
                      </span>
                    </div>
                    {task.description ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{taskSecondaryMeta(task)}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.createdBy.name} → {task.assignee.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {remaining ? (
                      <span className={`text-xs ${remainingTimeClassName(remaining.tone)}`}>
                        {remaining.label}
                      </span>
                    ) : null}
                    {href ? (
                      <Link href={href} className="text-sm font-medium text-primary hover:underline">
                        去跟进
                      </Link>
                    ) : null}
                    {canMarkDone ? (
                      <GeneralAssignmentActionButton assignmentId={task.id} mode="mark_done" />
                    ) : null}
                    {canConfirm ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <GeneralAssignmentActionButton assignmentId={task.id} mode="confirm" />
                        <GeneralAssignmentActionButton assignmentId={task.id} mode="reject" />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
