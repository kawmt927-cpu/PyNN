import { redirect } from "next/navigation";

/** 已合并到「待跟进」；保留旧链接兼容 */
export default function MobileDueFollowUpsRedirectPage() {
  redirect("/mobile/follow-ups?scope=due");
}
