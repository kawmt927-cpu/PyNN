"use server";

/** @deprecated 请使用 @/app/(dashboard)/plans-tasks/actions */
export {
  createWeeklyAssignment,
  cancelWeeklyAssignment,
  markWeeklyAssignmentDone,
  confirmWeeklyAssignment,
  rejectWeeklyAssignment,
} from "@/app/(dashboard)/plans-tasks/actions";
