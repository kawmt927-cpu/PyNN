import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/session";

export default async function HrHomePage() {
  await requireRole(["HR", "ADMIN"]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="text-2xl font-bold">行政人事工作台</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">功能筹备中</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>账号已开通。线上报销等相关能力将在后续版本上线。</p>
          <p>当前可先使用企业微信扫码或账密登录验证账号是否可用。</p>
        </CardContent>
      </Card>
    </div>
  );
}
