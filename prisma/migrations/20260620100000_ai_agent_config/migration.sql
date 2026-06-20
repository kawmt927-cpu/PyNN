-- CreateTable
CREATE TABLE "AiAgentConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'kimi',
    "apiKey" TEXT,
    "apiBase" TEXT NOT NULL DEFAULT 'https://api.moonshot.cn/v1',
    "model" TEXT NOT NULL DEFAULT 'kimi-k2.5',
    "maxSteps" INTEGER NOT NULL DEFAULT 5,
    "thinkingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "salesLogSystemPrompt" TEXT,
    "toolSearchCustomers" BOOLEAN NOT NULL DEFAULT true,
    "toolSearchOpportunities" BOOLEAN NOT NULL DEFAULT true,
    "toolGetCustomer" BOOLEAN NOT NULL DEFAULT true,
    "toolListFollowUps" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "AiAgentConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
