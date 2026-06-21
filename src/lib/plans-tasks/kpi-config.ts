import { prisma } from "@/lib/prisma";

const KPI_CONFIG_ID = "default";

export async function getSalesKpiConfig() {
  const row = await prisma.salesKpiConfig.findUnique({ where: { id: KPI_CONFIG_ID } });
  if (row) return row;
  return prisma.salesKpiConfig.create({
    data: { id: KPI_CONFIG_ID },
  });
}

export async function saveProjectDevMinStage(value: string | null) {
  await prisma.salesKpiConfig.upsert({
    where: { id: KPI_CONFIG_ID },
    create: { id: KPI_CONFIG_ID, projectDevMinStageValue: value },
    update: { projectDevMinStageValue: value },
  });
}

export async function getProjectDevMinStageSortOrder(): Promise<number | null> {
  const config = await getSalesKpiConfig();
  if (!config.projectDevMinStageValue) return null;

  const stage = await prisma.configOption.findFirst({
    where: {
      category: "opportunity_stage",
      value: config.projectDevMinStageValue,
      enabled: true,
    },
    select: { sortOrder: true },
  });
  return stage?.sortOrder ?? null;
}
