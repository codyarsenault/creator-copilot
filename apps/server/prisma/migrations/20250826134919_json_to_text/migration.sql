-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Idea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "niche" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "goals" TEXT NOT NULL,
    "pillars" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT NOT NULL,
    "outline" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "tips" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Idea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Idea" ("caption", "createdAt", "cta", "goals", "hashtags", "hook", "id", "niche", "outline", "pillars", "tips", "tone", "userId") SELECT "caption", "createdAt", "cta", "goals", "hashtags", "hook", "id", "niche", "outline", "pillars", "tips", "tone", "userId" FROM "Idea";
DROP TABLE "Idea";
ALTER TABLE "new_Idea" RENAME TO "Idea";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
