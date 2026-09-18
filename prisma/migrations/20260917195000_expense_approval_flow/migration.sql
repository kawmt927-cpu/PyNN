-- AlterTable
ALTER TABLE "ExpenseClaim" ADD COLUMN "flowSnapshot" JSONB;
ALTER TABLE "ExpenseClaim" ADD COLUMN "currentStepIndex" INTEGER;

-- CreateIndex
CREATE INDEX "ExpenseClaim_status_currentStepIndex_idx" ON "ExpenseClaim"("status", "currentStepIndex");

-- CreateTable
CREATE TABLE "ExpenseApprovalFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "ExpenseApprovalFlow_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseApprovalFlowStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flowId" TEXT NOT NULL DEFAULT 'default',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "roleKeys" JSONB,
    "userIds" JSONB,
    "roleMappings" JSONB,
    "isFinalPayout" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseApprovalFlowStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ExpenseApprovalFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExpenseApprovalFlowStep_flowId_sortOrder_idx" ON "ExpenseApprovalFlowStep"("flowId", "sortOrder");
