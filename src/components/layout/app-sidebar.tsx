import { AppSidebarClient } from "@/components/layout/app-sidebar-client";
import type { NavItem } from "@/lib/nav/primary-nav";
import type { ImpersonationTarget } from "@/lib/auth/impersonation";

type Props = {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  pendingApprovalCount?: number;
  unreadNotificationCount?: number;
  impersonationTargets?: ImpersonationTarget[];
  impersonatorName?: string | null;
  showMobileSwitch?: boolean;
};

/** 服务端包装：实际交互在 AppSidebarClient */
export function AppSidebar(props: Props) {
  return <AppSidebarClient {...props} />;
}
