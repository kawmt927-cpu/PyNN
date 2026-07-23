import { getPrismaClient } from "@/lib/prisma";

/** 客户是否存在（用于区分 404 与无权查看） */
export async function customerExists(id: string) {
  const db = getPrismaClient();
  const row = await db.customer.findUnique({
    where: { id },
    select: { id: true },
  });
  return Boolean(row);
}
