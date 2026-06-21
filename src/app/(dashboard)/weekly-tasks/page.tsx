import { redirect } from "next/navigation";

export default function WeeklyTasksRedirectPage() {
  redirect("/plans-tasks?tab=tasks");
}
