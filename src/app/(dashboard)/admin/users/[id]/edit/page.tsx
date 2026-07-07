import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserForm } from "@/components/users/user-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditUserPage({ params }: Props) {
  await requireRole(["ADMIN"]);
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { personnelProfile: true },
  });

  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">编辑用户</h1>
        <Button asChild variant="outline">
          <Link href="/admin/users">返回列表</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <UserForm
            userId={user.id}
            defaultValues={{
              name: user.name,
              email: user.email,
              role: user.role,
              enabled: user.personnelProfile?.enabled ?? true,
              isPresales: user.personnelProfile?.isPresales ?? false,
              dailyRate: user.personnelProfile?.dailyRate
                ? Number(user.personnelProfile.dailyRate)
                : null,
              wecomUserId: user.wecomUserId,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
