import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { deleteSalesCheckIn } from "@/lib/sales-log/check-in";
import type { UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

type Props = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (!SALES_LOG_ROLES.includes(session.user.role)) {
    return Response.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return Response.json({ error: "缺少打卡记录 ID" }, { status: 400 });
  }

  try {
    await deleteSalesCheckIn({
      checkInId: id.trim(),
      userId: session.user.id,
      role: session.user.role,
    });

    revalidatePath("/sales-log");
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
