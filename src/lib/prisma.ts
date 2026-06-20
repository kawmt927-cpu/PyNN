import { PrismaClient, Prisma } from "@prisma/client";

/** schema 有 breaking 变更时递增，强制丢弃旧 Prisma 单例 */
const PRISMA_CACHE_VERSION = 12;

type PrismaClientWithModels = PrismaClient & {
  customerClaimRequest?: { findMany?: unknown };
  opportunity?: { findMany?: unknown };
  opportunityFollowUp?: { create?: unknown };
};

type PrismaGlobal = {
  __prismaClient?: PrismaClient;
  __prismaClientVersion?: number;
};

const globalStore = globalThis as unknown as PrismaGlobal;

function assertClientHasModels(client: PrismaClient) {
  const c = client as PrismaClientWithModels;
  if (typeof c.customerClaimRequest?.findMany !== "function") {
    throw new Error(
      "Prisma Client 未包含 customerClaimRequest 模型。请在项目目录执行：npx prisma generate && rm -rf .next && npm run dev"
    );
  }
  if (typeof c.opportunity?.findMany !== "function") {
    throw new Error(
      "Prisma Client 未包含 opportunity 模型。请在项目目录执行：npx prisma generate && rm -rf .next && npm run dev"
    );
  }
  if (!("changeSummary" in Prisma.OpportunityFollowUpScalarFieldEnum)) {
    throw new Error(
      "Prisma Client 未包含 OpportunityFollowUp.changeSummary 字段。请在项目目录执行：npx prisma migrate deploy && npx prisma generate && rm -rf .next && npm run dev"
    );
  }
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  assertClientHasModels(client);
  return client;
}

export function getPrismaClient(): PrismaClient {
  const versionMatch = globalStore.__prismaClientVersion === PRISMA_CACHE_VERSION;
  const cached = globalStore.__prismaClient;

  if (!cached || !versionMatch) {
    if (cached) {
      void cached.$disconnect().catch(() => {});
    }
    globalStore.__prismaClient = createPrismaClient();
    globalStore.__prismaClientVersion = PRISMA_CACHE_VERSION;
  }

  return globalStore.__prismaClient!;
}

/** 兼容现有 import { prisma } from '@/lib/prisma' */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
