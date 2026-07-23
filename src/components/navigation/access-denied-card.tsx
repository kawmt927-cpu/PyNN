import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  backHref?: string;
  backLabel?: string;
  entityLabel?: string;
};

export function AccessDeniedCard({
  backHref = "/customers",
  backLabel = "返回客户列表",
  entityLabel = "该客户",
}: Props) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-lg">无权查看</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          您无权查看{entityLabel}。如需访问，请联系负责人或销售管理。
        </p>
        <Button asChild variant="outline">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
