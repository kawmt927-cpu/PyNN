import type { Metadata, Viewport } from "next";
import { MobileShell } from "@/components/mobile/mobile-shell";

export const metadata: Metadata = {
  title: "培安 CRM · 销售",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
      <MobileShell>{children}</MobileShell>
    </div>
  );
}
