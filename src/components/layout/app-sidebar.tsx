import { AppSidebarClient } from "./app-sidebar-client";
import type { NavItem } from "@/lib/permissions";

type Props = {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  pendingApprovalCount?: number;
};

export function AppSidebar({ nav, userName, roleLabel, pendingApprovalCount = 0 }: Props) {
  return (
    <AppSidebarClient
      nav={nav}
      userName={userName}
      roleLabel={roleLabel}
      pendingApprovalCount={pendingApprovalCount}
    />
  );
}
