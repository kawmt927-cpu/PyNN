import Link from "next/link";
import { withReturnTo } from "@/lib/navigation/return-to";
import { cn } from "@/lib/utils";

type Props = {
  customerId: string | null | undefined;
  name: string | null | undefined;
  /** 返回路径（桌面端列表常用） */
  returnTo?: string;
  /** 桌面 `/customers` 或手机 `/mobile/customers` */
  basePath?: "/customers" | "/mobile/customers";
  className?: string;
  /** 无 id 时的占位文案 */
  fallback?: string;
};

/**
 * 客户名称可点击进入详情；无 customerId 时退化为普通文本。
 */
export function CustomerNameLink({
  customerId,
  name,
  returnTo,
  basePath = "/customers",
  className,
  fallback = "—",
}: Props) {
  const label = name?.trim() || fallback;
  if (!customerId) {
    return <span className={cn("text-muted-foreground", className)}>{label}</span>;
  }

  const path = `${basePath.replace(/\/$/, "")}/${customerId}`;
  const href = returnTo ? withReturnTo(path, returnTo) : path;

  return (
    <Link
      href={href}
      className={cn("font-medium text-primary hover:underline", className)}
      title={label}
    >
      {label}
    </Link>
  );
}
