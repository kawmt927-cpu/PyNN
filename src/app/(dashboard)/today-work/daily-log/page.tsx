import { requireRole } from "@/lib/session";
import { BackLink } from "@/components/navigation/back-link";
import { SalesLogAiChat } from "@/components/sales-log/sales-log-ai-chat";

export default async function TodayWorkDailyLogPage() {
  await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">今日日报 · AI 助理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            在 PC 端与 AI 对话整理日报，确认后写入今日工作。定位打卡请使用「往来打卡」。
          </p>
        </div>
        <BackLink href="/today-work" label="返回今日工作" />
      </div>

      <div className="h-[min(75vh,780px)] overflow-hidden rounded-xl border bg-card shadow-sm">
        <SalesLogAiChat
          enableLocationAssist={false}
          title="AI 日报助理"
          subtitle="描述今日拜访与工作进展，助理将整理成日报"
        />
      </div>
    </div>
  );
}
