import { Prisma } from "@prisma/client";
import { CONFIG_CATEGORY } from "@/lib/config-options";

type DbClient = Prisma.TransactionClient;

/** 删除或停用选项前，清理业务数据中对该 option value 的引用 */
export async function clearConfigOptionReferences(
  db: DbClient,
  category: string,
  value: string
) {
  switch (category) {
    case CONFIG_CATEGORY.CUSTOMER_SOURCE:
      await db.customer.updateMany({ where: { source: value }, data: { source: null } });
      break;
    case CONFIG_CATEGORY.CUSTOMER_TYPE:
      await db.customer.updateMany({ where: { customerType: value }, data: { customerType: null } });
      break;
    case CONFIG_CATEGORY.CUSTOMER_GRADE:
      await db.customer.updateMany({ where: { customerGrade: value }, data: { customerGrade: null } });
      await db.followUp.updateMany({
        where: { suggestedGrade: value },
        data: { suggestedGrade: null, gradeApplied: false },
      });
      break;
  }
}
