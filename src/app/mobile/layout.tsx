import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "销售日志 - 培安 CRM",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-[env(safe-area-inset-bottom)]">
      {children}
    </div>
  );
}
