import { redirect } from "next/navigation";

/** 管理助手已迁至统计管理 */
export default function LegacyManagerAssistantRedirect() {
  redirect("/admin/stats/assistant");
}
