import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { completeSalesCheckInManually, deleteSalesCheckIn } from "@/lib/sales-log/check-in";
import { completeCheckInSchema } from "@/lib/validations/sales-log";
import type { FollowUpMethod, UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

type Props = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: Props) {
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
    const body = await req.json();
    const parsed = completeCheckInSchema.parse(body);

    await completeSalesCheckInManually({
      checkInId: id.trim(),
      userId: session.user.id,
      role: session.user.role,
      contactId: parsed.contactId,
      method: parsed.method,
      content: parsed.content,
      result: parsed.result,
      suggestedGrade: parsed.suggestedGrade,
      opportunityId: parsed.opportunityId,
      nextFollowUpAt: parsed.nextFollowUpAt,
      nextFollowUpMethod: (parsed.nextFollowUpMethod as FollowUpMethod | null) ?? undefined,
      location: parsed.location,
      detailedNotes: parsed.detailedNotes,
    });

    revalidatePath("/sales-log");
    revalidatePath("/today-work");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.errors[0]?.message ?? "表单无效" },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "完善失败";
    return Response.json({ error: message }, { status: 400 });
  }
}

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
    revalidatePath("/today-work");
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
