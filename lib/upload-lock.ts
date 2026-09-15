import { randomUUID } from "crypto";
import { db } from "./db";
import { HttpError } from "./http";
export async function clearOrphanedLock(videoId: string) {
  const video = await db.video.findUnique({
    where: { id: videoId },
    select: { uploadLock: true },
  });
  const lock = video?.uploadLock;
  if (!lock) return;
  const match = /^(\d+):/.exec(lock);
  if (!match) return;
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0);
    return;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ESRCH") return;
  }
  await db.video.updateMany({
    where: { id: videoId, status: "uploading", uploadLock: lock },
    data: { uploadLock: null },
  });
}
export async function claimUpload(videoId: string, creatorId: string) {
  await clearOrphanedLock(videoId);
  const lock = process.pid + ":" + randomUUID();
  const claim = await db.$transaction(async (tx) => {
    const active = await tx.video.count({
      where: { status: "uploading", uploadLock: { not: null } },
    });
    if (active >= 3)
      throw new HttpError(
        429,
        "Upload processing is busy. Please retry shortly.",
        { "Retry-After": "5" },
      );
    return tx.video.updateMany({
      where: { id: videoId, creatorId, status: "uploading", uploadLock: null },
      data: { uploadLock: lock },
    });
  });
  if (claim.count !== 1)
    throw new HttpError(
      409,
      "Upload is unavailable or another chunk is being processed.",
    );
  return lock;
}
