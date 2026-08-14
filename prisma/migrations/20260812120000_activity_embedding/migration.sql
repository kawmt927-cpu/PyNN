-- CreateTable
CREATE TABLE "ActivityEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vectorJson" TEXT NOT NULL,
    "textPreview" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEmbedding_sourceType_sourceId_key" ON "ActivityEmbedding"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ActivityEmbedding_occurredAt_idx" ON "ActivityEmbedding"("occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEmbedding_userId_occurredAt_idx" ON "ActivityEmbedding"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEmbedding_sourceType_occurredAt_idx" ON "ActivityEmbedding"("sourceType", "occurredAt");
