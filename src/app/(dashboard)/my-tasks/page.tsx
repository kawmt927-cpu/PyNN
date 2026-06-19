import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MyTasksPage() {
  await requireRole(["PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN"]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>我的任务</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">模块脚手架已就绪，后续迭代中完善。</p>
      </CardContent>
    </Card>
  );
}
