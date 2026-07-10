import { trimOverlappingProjectAllocations } from "../src/lib/projects/allocation-dedup";
import { prisma } from "../src/lib/prisma";

async function main() {
  const fixed = await trimOverlappingProjectAllocations();
  console.log(`已修剪 ${fixed} 处重叠排班分段`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
