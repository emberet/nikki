import fs from "fs/promises";
import { db } from "./db";
import { safeHeldPath } from "./uploads";
import { clearOrphanedLock } from "./upload-lock";
export const HELD_BUDGET_BYTES = 5_000_000_000n;
export async function cleanupPublishedCache(videoId?: string) {
  const copies = await db.video.findMany({
    where: {
      ...(videoId ? { id: videoId } : {}),
      status: "published",
      filePath: { not: null },
      arweaveTx: { not: null },
      recordTx: { not: null },
      archiveJson: { not: null },
    },
    take: 10,
  });
  for (const video of copies) {
    try {
      await fs.rm(safeHeldPath(video.filePath!), { force: true });
      await db.video.updateMany({
        where: { id: video.id, status: "published", filePath: video.filePath },
        data: { filePath: null },
      });
    } catch {
      console.error("Published record cache cleanup deferred.");
    }
  }
}
export async function cleanupTemporaryFiles() {
  const day = new Date(Date.now() - 86400000),
    week = new Date(Date.now() - 7 * 86400000);
  const candidates = await db.video.findMany({
    where: {
      payment: null,
      OR: [
        { status: "uploading", createdAt: { lt: day } },
        { status: "snapshot_pending", createdAt: { lt: week } },
        {
          status: { in: ["approved", "rejected", "expired"] },
          finalizedAt: { lt: week },
        },
        { status: "cleanup_pending" },
      ],
    },
    take: 10,
  });
  for (const video of candidates) {
    await clearOrphanedLock(video.id);
    const claim = await db.video.updateMany({
      where: {
        id: video.id,
        status: video.status,
        uploadLock: null,
        payment: null,
      },
      data: { status: "cleanup_pending" },
    });
    if (!claim.count) continue;
    try {
      if (video.filePath)
        await fs.rm(safeHeldPath(video.filePath), { force: true });
      await db.video.updateMany({
        where: { id: video.id, status: "cleanup_pending" },
        data: { status: "expired_upload", filePath: null },
      });
    } catch {
      console.error("Temporary file cleanup deferred.");
    }
  }
  await cleanupPublishedCache();
}
