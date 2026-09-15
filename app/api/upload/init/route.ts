import { rateLimit } from "@/lib/rate-limit";
import { assertNewUploadsAllowed } from "@/lib/release";
import { cleanupTemporaryFiles, HELD_BUDGET_BYTES } from "@/lib/retention";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, HttpError, json } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/rules";
import { heldDir } from "@/lib/uploads";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    body = await jsonBody(req);
  assertNewUploadsAllowed(user.wallet);
  await rateLimit("upload-init", user.id, 10, 3600000);
  const {
    title,
    description = "",
    mimeType,
    sizeBytes,
    category = "Knowledge",
    language = "English",
    recordedAt = "",
    source = "",
  } = body;
  if (typeof title !== "string" || !title.trim() || title.length > 200)
    throw new HttpError(400, "Add a title of up to 200 characters.");
  if (
    typeof description !== "string" ||
    description.length > 5000 ||
    typeof source !== "string" ||
    source.length > 500 ||
    typeof language !== "string" ||
    language.length > 60
  )
    throw new HttpError(400, "The description or context is too long.");
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1024 ||
    sizeBytes > MAX_UPLOAD_BYTES
  )
    throw new HttpError(413, "Videos must be between 1 KB and 1 GB.");
  if (!["video/mp4", "video/webm"].includes(mimeType))
    throw new HttpError(415, "This pilot accepts MP4 and WebM videos.");
  if (!["History", "Knowledge", "Culture"].includes(category))
    throw new HttpError(400, "Choose a category.");
  if (
    typeof recordedAt !== "string" ||
    (recordedAt && !/^\d{4}-\d{2}-\d{2}$/.test(recordedAt))
  )
    throw new HttpError(400, "Invalid recording date.");
  await cleanupTemporaryFiles();
  // Serialize quota reservation so concurrent initializations cannot bypass limits.
  const video = await db.$transaction(async (tx) => {
    const pending = {
      status: {
        in: [
          "uploading",
          "snapshot_pending",
          "voting",
          "approved",
          "publishing",
          "publish_queued",
          "payment_received",
          "publish_failed",
        ],
      },
    };
    const [mine, held] = await Promise.all([
      tx.video.count({ where: { ...pending, creatorId: user.id } }),
      tx.video.findMany({
        where: { OR: [{ filePath: { not: null } }, { status: "uploading" }] },
        select: { expectedBytes: true, sizeBytes: true },
      }),
    ]);
    const reserved = held.reduce(
      (sum, v) =>
        sum + (v.expectedBytes > v.sizeBytes ? v.expectedBytes : v.sizeBytes),
      0n,
    );
    if (mine >= 2 || reserved + BigInt(sizeBytes) > HELD_BUDGET_BYTES)
      throw new HttpError(
        429,
        "The pilot upload queue is full. Please wait for existing submissions to finish.",
      );
    return tx.video.create({
      data: {
        title: title.trim(),
        description,
        category,
        language,
        source,
        recordedAt: recordedAt || null,
        mimeType,
        expectedBytes: BigInt(sizeBytes),
        creatorId: user.id,
        status: "uploading",
      },
    });
  });
  await fs.mkdir(heldDir(), { recursive: true });
  const filePath = path.join(heldDir(), video.id + ".bin");
  await fs.writeFile(filePath, "", { flag: "wx" });
  await db.video.update({ where: { id: video.id }, data: { filePath } });
  return json({ videoId: video.id });
});
