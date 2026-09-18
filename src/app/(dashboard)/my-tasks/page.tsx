import { redirect } from "next/navigation";

/** 兼容旧入口：并入「计划与任务 · 项目任务」 */
export default function MyTasksRedirectPage() {
  redirect("/plans-tasks?tab=project");
}
