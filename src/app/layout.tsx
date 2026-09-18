import type { Metadata } from "next";
import "./globals.css";
import { resolveBrandIconPaths } from "@/lib/brand-icons";

const brandIcons = resolveBrandIconPaths();

export const metadata: Metadata = {
  title: brandIcons.isLocal
    ? "培安 CRM（本地）- 医院软件 CRM + 项目管理"
    : "培安 CRM - 医院软件 CRM + 项目管理",
  description: "CRM 与项目管理系统",
  icons: {
    icon: [
      { url: brandIcons.icon32, sizes: "32x32", type: "image/png" },
      { url: brandIcons.icon, sizes: "1024x1024", type: "image/png" },
    ],
    apple: [{ url: brandIcons.apple, sizes: "180x180", type: "image/png" }],
    shortcut: brandIcons.icon32,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 企微 WebView 中 100vh/min-h-screen 常高于可视区，会滚出底部大片空白；
    // 用 dvh + overflow-hidden 把滚动限制在业务容器内。
    <html lang="zh-CN" className="h-dvh overflow-hidden overscroll-none">
      <body className="h-dvh overflow-hidden overscroll-none antialiased">{children}</body>
    </html>
  );
}
