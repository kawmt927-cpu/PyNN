"use client";

import { useTransition } from "react";
import { UserRole } from "@prisma/client";
import {
  approveWeComAccess,
  rejectWeComAccess,
} from "@/app/(dashboard)/admin/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABELS } from "@/lib/permissions";

export type WeComAccessRequestRow = {
  id: string;
  wecomUserId: string;
  name: string;
  email: string;
  message: string | null;
  createdAt: string;
};

type UserOption = { id: string; name: string; email: string };

type Props = {
  requests: WeComAccessRequestRow[];
  usersWithoutWecom: UserOption[];
};

const ASSIGNABLE_ROLES: UserRole[] = [
  "SALES",
  "SALES_MANAGER",
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "PROJECT_STAFF",
  "ADMIN",
];

export function WeComAccessRequestsPanel({ requests, usersWithoutWecom }: Props) {
  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">暂无待审批的企微开通申请。</p>
    );
  }

  return (
    <div className="space-y-6">
      {requests.map((req) => (
        <WeComAccessRequestCard
          key={req.id}
          request={req}
          usersWithoutWecom={usersWithoutWecom}
        />
      ))}
    </div>
  );
}

function WeComAccessRequestCard({
  request,
  usersWithoutWecom,
}: {
  request: WeComAccessRequestRow;
  usersWithoutWecom: UserOption[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">企微 UserID：</span>
          <span className="font-mono text-xs">{request.wecomUserId}</span>
        </p>
        <p>
          <span className="text-muted-foreground">申请姓名：</span>
          {request.name}
        </p>
        <p>
          <span className="text-muted-foreground">申请邮箱：</span>
          {request.email}
        </p>
        {request.message ? (
          <p>
            <span className="text-muted-foreground">备注：</span>
            {request.message}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          提交时间：{new Date(request.createdAt).toLocaleString("zh-CN")}
        </p>
      </div>

      <form
        className="grid gap-4 border-t pt-4 md:grid-cols-2"
        action={(formData) => {
          startTransition(async () => {
            await approveWeComAccess(formData);
          });
        }}
      >
        <input type="hidden" name="requestId" value={request.id} />
        <div className="space-y-2">
          <Label>开通方式</Label>
          <select
            name="mode"
            defaultValue="create"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="create">创建新 CRM 账号</option>
            <option value="bind">绑定到已有账号</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>角色</Label>
          <select
            name="role"
            defaultValue="SALES"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`name-${request.id}`}>姓名</Label>
          <Input
            id={`name-${request.id}`}
            name="name"
            defaultValue={request.name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`email-${request.id}`}>邮箱</Label>
          <Input
            id={`email-${request.id}`}
            name="email"
            type="email"
            defaultValue={request.email}
            required
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>绑定已有用户（仅「绑定到已有账号」时填写）</Label>
          <select
            name="existingUserId"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">请选择</option>
            {usersWithoutWecom.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "处理中…" : "批准并开通"}
          </Button>
        </div>
      </form>

      <form
        className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3"
        action={(formData) => {
          startTransition(async () => {
            await rejectWeComAccess(formData);
          });
        }}
      >
        <input type="hidden" name="requestId" value={request.id} />
        <div className="min-w-[200px] flex-1 space-y-2">
          <Label htmlFor={`reject-${request.id}`}>拒绝原因（选填）</Label>
          <Textarea id={`reject-${request.id}`} name="reviewNote" rows={2} />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          拒绝
        </Button>
      </form>
    </div>
  );
}
