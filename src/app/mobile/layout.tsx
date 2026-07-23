import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "培安 CRM · 手机端",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function MobileRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-[100dvh] overflow-hidden bg-background">{children}</div>;
}
