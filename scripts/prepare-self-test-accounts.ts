/**
 * 临时为自测账号写入手机号/密码（本地开发用）。
 * 人员主数据已备份至 tmp/backups/personnel-*
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("test123456", 10);
  const updates = [
    { name: "蔡晗蕾", phone: "13810000002" },
    { name: "钱金明", phone: "13810000011" },
    { name: "沈伟", phone: "13810000012" },
    { name: "王玉成", phone: "13810000021" },
  ];
  for (const u of updates) {
    const row = await prisma.user.findFirst({ where: { name: u.name } });
    if (!row) {
      console.log("MISSING", u.name);
      continue;
    }
    await prisma.user.update({
      where: { id: row.id },
      data: { phone: u.phone, passwordHash: hash },
    });
    console.log("READY", u.name, u.phone);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
