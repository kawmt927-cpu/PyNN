import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserForm } from "@/components/users/user-form";

export default async function NewUserPage() {
  await requireRole(["ADMIN"]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新建用户</h1>
        <Button asChild variant="outline">
          <Link href="/admin/users">返回列表</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>账号信息</CardTitle>
        </CardHeader>
        <CardContent>
          <UserForm />
        </CardContent>
      </Card>
    </div>
  );
}
