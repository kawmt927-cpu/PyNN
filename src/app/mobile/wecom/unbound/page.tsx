import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyWeComUserIdButton } from "@/components/auth/copy-wecom-user-id-button";

type Props = {
  searchParams: Promise<{ wecomUserId?: string }>;
};

export default async function WeComUnboundPage({ searchParams }: Props) {
  const { wecomUserId } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>企业微信尚未绑定 CRM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-muted-foreground">
          <p>
            您的企业微信身份还无法对应到 CRM 账号。请按以下方式之一完成绑定后再登录：
          </p>

          <ol className="list-decimal space-y-2 pl-5 text-foreground">
            <li>
              将下方 <strong>UserID</strong> 发给管理员，在「系统配置 → 企业微信」绑定到您的 CRM
              账号。
            </li>
            <li>
              若 CRM 邮箱与企微<strong>企业邮箱</strong>一致，管理员可在企微应用开启敏感信息授权后自动匹配（需重新登录）。
            </li>
          </ol>

          {wecomUserId ? (
            <div className="rounded-md border bg-muted/50 p-4">
              <p className="font-medium text-foreground">企业微信 UserID</p>
              <p className="mt-2 break-all font-mono text-xs">{wecomUserId}</p>
              <div className="mt-3">
                <CopyWeComUserIdButton userId={wecomUserId} />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-2">
            <Button asChild variant="outline">
              <Link href="/login">返回登录页</Link>
            </Button>
            <Button asChild>
              <a href="/api/auth/wecom?returnTo=/today-work">绑定完成后，重新企微登录</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
