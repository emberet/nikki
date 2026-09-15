import fs from "fs/promises";
import { claimUpload } from "@/lib/upload-lock";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, sameOrigin, HttpError, json, id } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/rules";
import { boundedBytes, safeHeldPath } from "@/lib/uploads";
export const runtime = "nodejs";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    url = new URL(req.url),
    videoId = id(url.searchParams.get("videoId"));
  const rawOffset = url.searchParams.get("offset");
  if (!rawOffset || !/^\d+$/.test(rawOffset))
    throw new HttpError(400, "A valid offset is required.");
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new HttpError(400, "Invalid offset.");
  const lock = await claimUpload(videoId, user.id);
  try {
    const video = await db.video.findUniqueOrThrow({ where: { id: videoId } });
    if (!video.filePath) throw new HttpError(409, "Upload is not ready.");
    const filePath = safeHeldPath(video.filePath),
      current = (await fs.stat(filePath)).size;
    if (offset !== current)
      return json({ error: "Upload offset changed.", expected: current }, 409);
    const buf = await boundedBytes(req);
    if (
      current + buf.length > MAX_UPLOAD_BYTES ||
      BigInt(current + buf.length) > video.expectedBytes
    )
      throw new HttpError(
        413,
        "This upload exceeds the declared size or 1 GB limit.",
      );
    await fs.appendFile(filePath, buf);
    await db.video.update({
      where: { id: videoId },
      data: { sizeBytes: BigInt(current + buf.length) },
    });
    return json({ received: current + buf.length });
  } finally {
    await db.video.updateMany({
      where: { id: videoId, uploadLock: lock },
      data: { uploadLock: null },
    });
  }
});
