-- CreateTable-like: SQLite stores enums as TEXT; add accessLevel with default NONE
ALTER TABLE "ProjectMember" ADD COLUMN "accessLevel" TEXT NOT NULL DEFAULT 'NONE';
