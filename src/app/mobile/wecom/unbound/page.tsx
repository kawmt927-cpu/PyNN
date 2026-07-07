import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyWeComUserIdButton } from "@/components/auth/copy-wecom-user-id-button";
import { WeComApplyForm } from "@/components/auth/wecom-apply-form";
import { getLatestWeComAccessRequest } from "@/lib/wecom/access-request";

type Props = {
  searchParams: Promise<{ wecomUserId?: string }>;
};

export default async function WeComUnboundPage({ searchParams }: Props) {
  const { wecomUserId } = await searchParams;
  const request = wecomUserId ? await getLatestWeComAccessRequest(wecomUserId) : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            {request?.status === "PENDING"
              ? "开通申请审核中"
              : request?.status === "REJECTED"
                ? "开通申请未通过"
                : "企业微信尚未开通 CRM"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-muted-foreground">
          {request?.status === "PENDING" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p>您的申请已提交，管理员审批通过后即可扫码进入系统。</p>
              <p className="mt-2 text-xs">
                申请姓名：{request.name} · 邮箱：{request.email}
              </p>
            </div>
          ) : request?.status === "REJECTED" ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
              <p>管理员未通过您的开通申请。</p>
              {request.reviewNote ? (
                <p className="mt-2 text-xs">原因：{request.reviewNote}</p>
              ) : null}
              <p className="mt-2 text-xs">可修改信息后重新提交申请。</p>
            </div>
          ) : (
            <p>
              首次使用企业微信登录需先提交开通申请，管理员确认并分配角色后，再次扫码即可进入系统。
            </p>
          )}

          {wecomUserId ? (
            <div className="rounded-md border bg-muted/50 p-4">
              <p className="font-medium text-foreground">企业微信 UserID</p>
              <p className="mt-2 break-all font-mono text-xs">{wecomUserId}</p>
              <div className="mt-3">
                <CopyWeComUserIdButton userId={wecomUserId} />
              </div>
            </div>
          ) : null}

          {wecomUserId && request?.status !== "PENDING" ? (
            <WeComApplyForm
              wecomUserId={wecomUserId}
              defaultName={request?.status === "REJECTED" ? request.name : ""}
              defaultEmail={request?.status === "REJECTED" ? request.email : ""}
            />
          ) : null}

          <div className="flex flex-col gap-2 pt-2">
            <Button asChild variant="outline">
              <Link href="/login">返回登录页</Link>
            </Button>
            {request?.status === "APPROVED" || request?.status === "PENDING" ? (
              <Button asChild>
                <a href="/api/auth/wecom?returnTo=/today-work">重新企微登录</a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
