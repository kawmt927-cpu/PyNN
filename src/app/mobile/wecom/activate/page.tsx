import Link from "next/link";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/permissions";
import { WECOM_PENDING_USER_COOKIE } from "@/lib/wecom/oauth-flow";
import { isUserActivated } from "@/lib/auth/user-activation";
import { WeComActivateForm } from "./activate-form";

type Props = {
  searchParams: Promise<{ wecomUserId?: string }>;
};

export default async function WeComActivatePage({ searchParams }: Props) {
  const { wecomUserId: fromQuery } = await searchParams;
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(WECOM_PENDING_USER_COOKIE)?.value;
  const wecomUserId = fromCookie || fromQuery?.trim() || "";

  const user = wecomUserId
    ? await prisma.user.findUnique({ where: { wecomUserId } })
    : null;

  const mismatch =
    Boolean(wecomUserId) &&
    Boolean(fromCookie) &&
    fromQuery &&
    fromCookie !== fromQuery;

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-lg items-center overflow-y-auto overscroll-contain p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>完善登录信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {!wecomUserId || mismatch ? (
            <>
              <p>企微身份无效或已过期，请重新扫码进入。</p>
              <Button asChild>
                <a href="/api/auth/wecom?returnTo=/mobile">重新企微登录</a>
              </Button>
            </>
          ) : !user ? (
            <>
              <p>未找到与该企微账号匹配的预建用户，请提交开通申请。</p>
              <Button asChild>
                <Link
                  href={`/mobile/wecom/unbound?wecomUserId=${encodeURIComponent(wecomUserId)}`}
                >
                  去开通申请
                </Link>
              </Button>
            </>
          ) : isUserActivated(user) ? (
            <>
              <p>账号已激活，请重新企微登录进入系统。</p>
              <Button asChild>
                <a href="/api/auth/wecom?returnTo=/mobile">重新企微登录</a>
              </Button>
            </>
          ) : (
            <>
              <p>
                系统已为您预建账号。请设置手机号与密码，完成后即可使用企微或账密登录。无需等待管理员再次审核。
              </p>
              <WeComActivateForm
                wecomUserId={wecomUserId}
                name={user.name}
                roleLabel={ROLE_LABELS[user.role]}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
