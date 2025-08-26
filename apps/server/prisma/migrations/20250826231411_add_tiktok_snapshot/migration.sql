-- CreateTable
CREATE TABLE "TikTokSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "followerCount" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TikTokSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TikTokSnapshot_userId_capturedAt_idx" ON "TikTokSnapshot"("userId", "capturedAt");
