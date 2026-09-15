-- CreateTable
CREATE TABLE "RateBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FounderRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FounderRecord_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RuntimeState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "creatorId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Knowledge',
    "recordedAt" TEXT,
    "language" TEXT NOT NULL DEFAULT 'English',
    "source" TEXT NOT NULL DEFAULT '',
    "expectedBytes" BIGINT NOT NULL DEFAULT 0,
    "voteOpensAt" DATETIME,
    "voteClosesAt" DATETIME,
    "snapshotSlot" BIGINT,
    "snapshotHash" TEXT,
    "snapshotMint" TEXT,
    "snapshotDecimals" INTEGER,
    "finalizedAt" DATETIME,
    "yesCount" INTEGER NOT NULL DEFAULT 0,
    "noCount" INTEGER NOT NULL DEFAULT 0,
    "publicationError" TEXT,
    "publishClaimedAt" DATETIME,
    "storageReceipt" TEXT,
    "recordTx" TEXT,
    "archiveJson" TEXT,
    "publicationMethod" TEXT NOT NULL DEFAULT 'community',
    "uploadLock" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'video/mp4',
    "filePath" TEXT,
    "arweaveTx" TEXT,
    "thumbPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "Video_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("archiveJson", "arweaveTx", "category", "createdAt", "creatorId", "description", "expectedBytes", "filePath", "finalizedAt", "id", "language", "mimeType", "noCount", "publicationError", "publishClaimedAt", "publishedAt", "recordTx", "recordedAt", "sha256", "sizeBytes", "snapshotDecimals", "snapshotHash", "snapshotMint", "snapshotSlot", "source", "status", "storageReceipt", "thumbPath", "title", "uploadLock", "voteClosesAt", "voteOpensAt", "yesCount") SELECT "archiveJson", "arweaveTx", "category", "createdAt", "creatorId", "description", "expectedBytes", "filePath", "finalizedAt", "id", "language", "mimeType", "noCount", "publicationError", "publishClaimedAt", "publishedAt", "recordTx", "recordedAt", "sha256", "sizeBytes", "snapshotDecimals", "snapshotHash", "snapshotMint", "snapshotSlot", "source", "status", "storageReceipt", "thumbPath", "title", "uploadLock", "voteClosesAt", "voteOpensAt", "yesCount" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE UNIQUE INDEX "Video_recordTx_key" ON "Video"("recordTx");
CREATE UNIQUE INDEX "Video_arweaveTx_key" ON "Video"("arweaveTx");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RateBucket_expiresAt_idx" ON "RateBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FounderRecord_videoId_key" ON "FounderRecord"("videoId");

