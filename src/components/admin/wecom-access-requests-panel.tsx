"use client";

import { useState, useTransition } from "react";
import { UserRole } from "@prisma/client";
import {
  approveWeComAccess,
  rejectWeComAccess,
} from "@/app/(dashboard)/admin/users/wecom-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";

export type WeComAccessRequestRow = {
  id: string;
  wecomUserId: string;
  name: string;
  phone: string;
  message: string | null;
  createdAt: string;
  hasPassword: boolean;
};

type UserOption = { id: string; name: string; phone: string | null; email: string | null };

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
  "HR",
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
  const [role, setRole] = useState<UserRole>("SALES");

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
          <span className="text-muted-foreground">手机号：</span>
          {request.phone}
        </p>
        <p className="text-xs text-muted-foreground">
          {request.hasPassword
            ? "申请人已设置登录密码（批准后生效）"
            : "申请人未设置密码，将生成随机密码，请提醒其重置"}
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
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
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
          <Label htmlFor={`phone-${request.id}`}>手机号</Label>
          <Input
            id={`phone-${request.id}`}
            name="phone"
            type="tel"
            defaultValue={request.phone}
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
                {u.name}
                {u.phone ? ` · ${u.phone}` : ""}
                {u.email ? ` · ${u.email}` : ""}
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
