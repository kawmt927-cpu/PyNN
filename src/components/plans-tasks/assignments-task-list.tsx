import {
  listAllAssignmentsForManager,
  listAllAssignmentsForUser,
  canManageWeeklyAssignments,
} from "@/lib/today-work/weekly-assignments";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import type { UserRole } from "@prisma/client";
import {
  AssignmentsManagerListClient,
  AssignmentsUserListClient,
} from "@/components/plans-tasks/assignments-task-list-client";

type Props = {
  role: UserRole;
  userId: string;
  returnPath: string;
};

export async function AssignmentsTaskList({ role, userId, returnPath }: Props) {
  const canManage = canManageWeeklyAssignments(role);

  if (canManage) {
    const [assignments, salesUsers] = await Promise.all([
      listAllAssignmentsForManager(),
      listSalesUsersForSelect(),
    ]);

    return (
      <AssignmentsManagerListClient
        assignments={assignments}
        salesUsers={salesUsers}
        userId={userId}
      />
    );
  }

  const tasks = await listAllAssignmentsForUser(userId);

  return (
    <AssignmentsUserListClient tasks={tasks} userId={userId} returnPath={returnPath} />
  );
}
