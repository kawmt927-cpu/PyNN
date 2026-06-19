import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  searchParams: Promise<{ wecomUserId?: string }>;
};

export default async function WeComUnboundPage({ searchParams }: Props) {
  const { wecomUserId } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>账号未绑定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>您的企业微信身份尚未绑定 CRM 账号，请联系管理员完成绑定后再使用。</p>
          {wecomUserId && (
            <div className="rounded-md bg-muted p-3">
              <p className="font-medium text-foreground">企业微信 UserID</p>
              <p className="mt-1 break-all font-mono text-xs">{wecomUserId}</p>
              <p className="mt-2 text-xs">请将此 ID 提供给管理员，在「系统配置」中绑定到您的 CRM 账号。</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
