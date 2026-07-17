import Link from "next/link";
import { ChevronRight, Building2, Briefcase, FileText, Monitor } from "lucide-react";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";

const LINKS = [
  {
    href: "/mobile/customers",
    label: "客户",
    desc: "搜索与查阅客户、联系人",
    icon: Building2,
  },
  {
    href: "/mobile/opportunities",
    label: "商机",
    desc: "未签约商机与阶段摘要",
    icon: Briefcase,
  },
  {
    href: "/mobile/contracts",
    label: "合同",
    desc: "合同状态与金额查阅",
    icon: FileText,
  },
  {
    href: "/today-work",
    label: "电脑版今日工作",
    desc: "完整功能请在电脑浏览器打开",
    icon: Monitor,
  },
] as const;

export default async function MobileMorePage() {
  await requireRole(SALES_MOBILE_ROLES);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">更多</h1>
        <p className="text-xs text-muted-foreground">查阅客户 / 商机 / 合同</p>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pb-8">
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-muted/50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        })}
        <p className="px-1 pt-2 text-xs text-muted-foreground">
          新建客户、签约、复杂编辑等请在电脑端完成。
        </p>
      </div>
    </div>
  );
}
