-- AlterTable
ALTER TABLE "User" ADD COLUMN "wecomUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_wecomUserId_key" ON "User"("wecomUserId");
