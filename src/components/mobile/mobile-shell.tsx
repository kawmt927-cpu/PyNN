"use client";

import { usePathname } from "next/navigation";
import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";

type Props = {
  children: React.ReactNode;
  navVariant?: "sales" | "manager" | "none";
  moreBadge?: boolean;
};

export function MobileShell({
  children,
  navVariant = "sales",
  moreBadge = false,
}: Props) {
  const pathname = usePathname();
  const hideChrome =
    pathname.startsWith("/mobile/wecom") ||
    pathname.startsWith("/mobile/pc-only") ||
    navVariant === "none";

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-lg flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <MobileBottomNav
        variant={navVariant === "manager" ? "manager" : "sales"}
        moreBadge={moreBadge}
      />
    </div>
  );
}
