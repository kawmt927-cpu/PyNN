-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "grade" TEXT;

-- CreateTable
CREATE TABLE "FollowUpOpportunity" (
    "followUpId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,

    PRIMARY KEY ("followUpId", "opportunityId"),
    CONSTRAINT "FollowUpOpportunity_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUpOpportunity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FollowUpOpportunity_opportunityId_idx" ON "FollowUpOpportunity"("opportunityId");

-- CreateIndex
CREATE INDEX "Opportunity_grade_idx" ON "Opportunity"("grade");

-- Backfill join from legacy FollowUp.opportunityId
INSERT OR IGNORE INTO "FollowUpOpportunity" ("followUpId", "opportunityId")
SELECT "id", "opportunityId" FROM "FollowUp" WHERE "opportunityId" IS NOT NULL;

-- Seed opportunity_grade config (P0–P3) with follow-up intervals
INSERT OR IGNORE INTO "ConfigOption" ("id", "category", "value", "label", "sortOrder", "color", "enabled", "followUpIntervalDays")
VALUES
  ('opp_grade_p0', 'opportunity_grade', 'P0', 'P0 · 最高优先', 1, '#ec4899', 1, 7),
  ('opp_grade_p1', 'opportunity_grade', 'P1', 'P1 · 高优先', 2, '#ec4899', 1, 14),
  ('opp_grade_p2', 'opportunity_grade', 'P2', 'P2 · 中优先', 3, '#f9a8d4', 1, 30),
  ('opp_grade_p3', 'opportunity_grade', 'P3', 'P3 · 低优先', 4, '#fce7f3', 1, 60);
