-- DropIndex
DROP INDEX "User_xId_key";

-- AlterTable
ALTER TABLE "Video" ADD COLUMN "archiveJson" TEXT;
ALTER TABLE "Video" ADD COLUMN "recordTx" TEXT;

-- CreateTable
CREATE TABLE "StorageQuote" (
    "reference" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "quoteLamports" BIGINT NOT NULL,
    "recipient" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "StorageQuote_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StorageQuote_videoId_idx" ON "StorageQuote"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_recordTx_key" ON "Video"("recordTx");

