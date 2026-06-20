import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** 将某分类下选项的 sortOrder 重排为 1, 2, 3… */
export async function renumberConfigOptions(db: Db, category: string) {
  const rows = await db.configOption.findMany({
    where: { category },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true },
  });

  await Promise.all(
    rows.map((row, index) =>
      db.configOption.update({
        where: { id: row.id },
        data: { sortOrder: index + 1 },
      })
    )
  );
}

export async function nextConfigOptionSortOrder(db: Db, category: string) {
  const agg = await db.configOption.aggregate({
    where: { category },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? 0) + 1;
}
