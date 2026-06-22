import { prisma } from "@/lib/prisma";

export async function generateContractNo(signedAt: Date): Promise<string> {
  const ymd = signedAt.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `HT-${ymd}-`;

  const latest = await prisma.contract.findFirst({
    where: { contractNo: { startsWith: prefix } },
    orderBy: { contractNo: "desc" },
    select: { contractNo: true },
  });

  let seq = 1;
  if (latest?.contractNo) {
    const tail = latest.contractNo.slice(prefix.length);
    const parsed = Number.parseInt(tail, 10);
    if (!Number.isNaN(parsed)) seq = parsed + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}
