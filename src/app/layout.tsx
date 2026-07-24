import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "培安 CRM - 医院软件 CRM + 项目管理",
  description: "CRM 与项目管理系统",
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
