-- CreateTable
CREATE TABLE "FollowUpContact" (
    "followUpId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    PRIMARY KEY ("followUpId", "contactId"),
    CONSTRAINT "FollowUpContact_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUp" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUpContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill existing single contact links
INSERT INTO "FollowUpContact" ("followUpId", "contactId")
SELECT "id", "contactId" FROM "FollowUp" WHERE "contactId" IS NOT NULL;
