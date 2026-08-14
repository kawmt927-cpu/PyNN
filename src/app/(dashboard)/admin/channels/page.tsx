import { redirect } from "next/navigation";

/** 旧「渠道看板」入口：表格已迁至统计管理 */
export default function LegacyChannelsRedirect() {
  redirect("/admin/stats/channels");
}
