import Link from "next/link";
import { requireSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { canAccessSalesMobile } from "@/lib/mobile/sales-roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MobilePcOnlyPage() {
  const session = await requireSession();
  const canMobile = canAccessSalesMobile(session.user.role);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>请使用电脑端</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            当前账号「{session.user.name}」（{ROLE_LABELS[session.user.role]}）的工作台在电脑浏览器中使用。
          </p>
          <p>手机端目前仅支持：销售、销售管理、管理员。</p>
          {canMobile ? (
            <Button asChild className="w-full">
              <Link href="/mobile">进入手机端</Link>
            </Button>
          ) : (
            <Button asChild className="w-full" variant="outline">
              <Link href="/">打开电脑端首页</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
