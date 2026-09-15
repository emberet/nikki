-- AlterTable
ALTER TABLE "User" ADD COLUMN "xId" TEXT;
ALTER TABLE "User" ADD COLUMN "xLinkedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "xUsername" TEXT;

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "EligibleVoter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "xId" TEXT NOT NULL,
    "xUsername" TEXT NOT NULL,
    CONSTRAINT "EligibleVoter_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "xId" TEXT NOT NULL,
    "xUsername" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "signature" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ballot_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
INSERT INTO "new_Video" ("arweaveTx", "createdAt", "creatorId", "description", "filePath", "id", "mimeType", "publishedAt", "sha256", "sizeBytes", "status", "thumbPath", "title") SELECT "arweaveTx", "createdAt", "creatorId", "description", "filePath", "id", "mimeType", "publishedAt", "sha256", "sizeBytes", "status", "thumbPath", "title" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE UNIQUE INDEX "Video_arweaveTx_key" ON "Video"("arweaveTx");
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountLamports" BIGINT NOT NULL,
    "quoteLamports" BIGINT NOT NULL,
    "txSignature" TEXT,
    "payerWallet" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recipient" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "expiresAt" DATETIME,
    "confirmedAt" DATETIME,
    "fileSha256" TEXT NOT NULL DEFAULT '',
    "refundTx" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amountLamports", "createdAt", "currency", "id", "payerWallet", "quoteLamports", "refundTx", "status", "txSignature", "videoId") SELECT "amountLamports", "createdAt", "currency", "id", "payerWallet", "quoteLamports", "refundTx", "status", "txSignature", "videoId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_videoId_key" ON "Payment"("videoId");
CREATE UNIQUE INDEX "Payment_txSignature_key" ON "Payment"("txSignature");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EligibleVoter_videoId_wallet_key" ON "EligibleVoter"("videoId", "wallet");

-- CreateIndex
CREATE INDEX "Ballot_videoId_choice_idx" ON "Ballot"("videoId", "choice");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_videoId_wallet_key" ON "Ballot"("videoId", "wallet");

-- CreateIndex
CREATE UNIQUE INDEX "User_xId_key" ON "User"("xId");

