"use client";

import { usePathname } from "next/navigation";
import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav";

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = pathname.startsWith("/mobile/wecom");

  if (hideNav) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-lg flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <MobileBottomNav />
    </div>
  );
}
