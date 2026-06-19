import { AppSidebarClient } from "./app-sidebar-client";
import type { NavItem } from "@/lib/permissions";

type Props = {
  nav: NavItem[];
  userName: string;
  roleLabel: string;
};

export function AppSidebar({ nav, userName, roleLabel }: Props) {
  return <AppSidebarClient nav={nav} userName={userName} roleLabel={roleLabel} />;
}
