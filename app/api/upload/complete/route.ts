import fs from "fs/promises";
import { claimUpload } from "@/lib/upload-lock";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, HttpError, json, id } from "@/lib/http";
import { fileHash, sniffVideo, safeHeldPath } from "@/lib/uploads";
import { MAX_UPLOAD_BYTES } from "@/lib/rules";
export const runtime = "nodejs";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    videoId = id((await jsonBody(req)).videoId),
    lock = await claimUpload(videoId, user.id);
  try {
    const video = await db.video.findUniqueOrThrow({ where: { id: videoId } });
    if (!video.filePath) throw new HttpError(409, "Upload missing.");
    const size = (await fs.stat(safeHeldPath(video.filePath))).size;
    if (
      size < 1024 ||
      size > MAX_UPLOAD_BYTES ||
      BigInt(size) !== video.expectedBytes
    )
      throw new HttpError(400, "The file is incomplete or exceeds 1 GB.");
    const mimeType = sniffVideo(video.filePath),
      sha256 = await fileHash(video.filePath);
    await db.video.update({
      where: { id: videoId },
      data: {
        status: "snapshot_pending",
        mimeType,
        sha256,
        sizeBytes: BigInt(size),
        uploadLock: null,
      },
    });
    return json({
      videoId,
      status: "snapshot_pending",
      sha256,
      sizeBytes: size,
    });
  } finally {
    await db.video.updateMany({
      where: { id: videoId, uploadLock: lock },
      data: { uploadLock: null },
    });
  }
});
