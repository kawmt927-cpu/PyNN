import Link from "next/link";
import {
  ChevronRight,
  Building2,
  Briefcase,
  FileText,
  ClipboardList,
  ClipboardCheck,
  CalendarDays,
  Bell,
} from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  SALES_MOBILE_ROLES,
  isMobileManagerRole,
} from "@/lib/mobile/sales-roles";
import {
  canStartImpersonation,
  getImpersonationTargetRoles,
  toImpersonationTargets,
} from "@/lib/auth/impersonation";
import { ClientModeSwitch } from "@/components/layout/client-mode-switch";
import { AdminImpersonationPanel } from "@/components/admin/admin-impersonation-panel";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { cn } from "@/lib/utils";

type MoreLink = {
  href: string;
  label: string;
  desc: string;
  icon: typeof Building2;
  badge?: boolean;
};

const BASE_LINKS: MoreLink[] = [
  {
    href: "/mobile/inbox",
    label: "消息",
    desc: "往来、日报与系统通知列表",
    icon: Bell,
  },
  {
    href: "/mobile/customers",
    label: "客户",
    desc: "搜索、新增与查阅；可写本人负责客户的跟进",
    icon: Building2,
  },
  {
    href: "/mobile/opportunities",
    label: "商机",
    desc: "未签约商机：新增与查阅",
    icon: Briefcase,
  },
  {
    href: "/mobile/contracts",
    label: "合同",
    desc: "合同状态与金额查阅",
    icon: FileText,
  },
  {
    href: "/mobile/follow-ups",
    label: "待跟进",
    desc: "到期与即将到期的跟进计划",
    icon: ClipboardList,
  },
];

export default async function MobileMorePage() {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const manager = isMobileManagerRole(session.user.role);
  const pendingApprovals = manager
    ? await countPendingApprovals({ id: session.user.id, role: session.user.role })
    : 0;

  const links: MoreLink[] = manager
    ? [
        {
          href: "/mobile/approvals",
          label: "审批",
          desc:
            pendingApprovals > 0
              ? `客户认领与合同审核 · ${pendingApprovals} 条待处理`
              : "客户认领与合同审核",
          icon: ClipboardCheck,
          badge: pendingApprovals > 0,
        },
        {
          href: "/mobile/plans",
          label: "计划与任务",
          desc: "本周团队待办；年度目标请在电脑端维护",
          icon: CalendarDays,
        },
        ...BASE_LINKS,
      ]
    : [
        {
          href: "/mobile/tasks",
          label: "待办",
          desc: "我的待跟进与指派任务",
          icon: ClipboardList,
        },
        ...BASE_LINKS,
      ];

  const impersonatorName = session.impersonator?.name ?? null;
  let impersonationTargets: ReturnType<typeof toImpersonationTargets> = [];
  if (!session.impersonator && canStartImpersonation(session.user.role)) {
    const targetRoles = getImpersonationTargetRoles(session.user.role);
    const users = await prisma.user.findMany({
      where: {
        id: { not: session.user.id },
        role: { in: targetRoles },
        OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
      },
      select: { id: true, name: true, role: true },
    });
    impersonationTargets = toImpersonationTargets(users);
  }
  const showAccountSwitch =
    Boolean(impersonatorName) || impersonationTargets.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">更多</h1>
        <p className="text-xs text-muted-foreground">
          {manager
            ? "审批 · 计划 · 客户 / 商机 / 合同 / 待跟进"
            : "待办 · 客户 / 商机 / 合同 / 待跟进"}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pb-8">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-muted/50"
            >
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Icon className="h-5 w-5" />
                {item.badge ? (
                  <span
                    className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive"
                    aria-label="有待处理"
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                      {pendingApprovals}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-xs text-muted-foreground",
                    item.badge && "text-destructive/90"
                  )}
                >
                  {item.desc}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        })}

        {showAccountSwitch ? (
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{session.user.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {ROLE_LABELS[session.user.role]}
              </span>
            </div>
            <p className="mb-1 text-sm font-medium">账号切换</p>
            <AdminImpersonationPanel
              targets={impersonationTargets}
              impersonatorName={impersonatorName}
            />
          </div>
        ) : null}

        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">界面切换</p>
          <ClientModeSwitch target="pc" />
          <p className="mt-2 text-xs text-muted-foreground">
            切换后手机浏览器也可使用电脑端布局，便于对照调试。
          </p>
        </div>

        <p className="px-1 pt-2 text-xs text-muted-foreground">
          签约、复杂编辑请在电脑端完成。
        </p>
      </div>
    </div>
  );
}
