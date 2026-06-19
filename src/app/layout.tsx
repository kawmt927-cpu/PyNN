import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "培安 CRM - 医院软件 CRM + 项目管理",
  description: "CRM 与项目管理系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
