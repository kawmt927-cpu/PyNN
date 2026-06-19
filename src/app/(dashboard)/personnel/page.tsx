import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PersonnelPage() {
  await requireRole(["PROJECT_ADMIN", "ADMIN"]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>实施人员管理</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">模块脚手架已就绪，后续迭代中完善。</p>
      </CardContent>
    </Card>
  );
}
