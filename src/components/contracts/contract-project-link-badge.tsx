import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  canOpenContractProjectProgress,
  contractProjectLinkLabel,
  shouldShowContractProjectLinkBadge,
} from "@/lib/contracts/contract-project-link";
import type { ContractStatus, UserRole } from "@prisma/client";

type Props = {
  status: ContractStatus;
  hasProject: boolean;
  /** 有项目时跳转（通常为合同详情 #contract-project） */
  href: string;
  role: UserRole;
};

export function ContractProjectLinkBadge({ status, hasProject, href, role }: Props) {
  if (!shouldShowContractProjectLinkBadge(status)) return null;

  const label = contractProjectLinkLabel(hasProject);
  const className = cn(
    "shrink-0 rounded-md px-2 py-0.5 text-xs",
    hasProject
      ? "border border-sky-300/80 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100"
      : "border border-muted-foreground/25 bg-muted/60 text-muted-foreground"
  );

  if (hasProject && canOpenContractProjectProgress(role)) {
    return (
      <Link href={href} className={cn(className, "hover:underline")} title="查看项目进度">
        {label}
      </Link>
    );
  }

  return <span className={className}>{label}</span>;
}
