import Link from "next/link";
import { requireRole } from "@/lib/session";
import { isAiAgentAvailable } from "@/lib/agent/runtime";
import { ManagerAiChat } from "@/components/manager/manager-ai-chat";
import { OctopusAvatar } from "@/components/manager/octopus-avatar";
import { Card, CardContent } from "@/components/ui/card";

export default async function StatsAssistantPage() {
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  const available = await isAiAgentAvailable();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <OctopusAvatar mood="cheer" size={56} className="mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/stats" className="hover:underline">
              统计管理
            </Link>
            <span className="mx-1.5">/</span>
            管理助手
          </p>
          <h1 className="mt-1 text-2xl font-bold">管理助手 · 触触</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            面向销售管理与管理员：查询团队日报、跟进、商机、回款与日志，并给出运营建议。只读，不改数据。
          </p>
        </div>
      </div>

      {!available ? (
        <Card>
          <CardContent className="flex items-start gap-3 py-8 text-sm text-muted-foreground">
            <OctopusAvatar mood="alert" size={40} />
            <p>
              AI 未启用或未配置 API Key。请管理员在{" "}
              <Link href="/admin/settings?tab=ai" className="text-blue-600 underline">
                系统配置 → AI 助手
              </Link>{" "}
              中开启。
            </p>
          </CardContent>
        </Card>
      ) : (
        <ManagerAiChat />
      )}
    </div>
  );
}
