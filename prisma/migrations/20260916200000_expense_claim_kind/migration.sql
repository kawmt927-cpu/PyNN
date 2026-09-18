-- CreateEnum
-- SQLite stores enums as TEXT; claimKind column with default FEE for existing rows

ALTER TABLE "ExpenseClaim" ADD COLUMN "claimKind" TEXT NOT NULL DEFAULT 'FEE';

CREATE INDEX "ExpenseClaim_claimKind_status_updatedAt_idx" ON "ExpenseClaim"("claimKind", "status", "updatedAt");
