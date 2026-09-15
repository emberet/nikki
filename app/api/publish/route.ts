import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, id, json, HttpError } from "@/lib/http";
import { publishingEnabled } from "@/lib/storage";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    videoId = id((await jsonBody(req)).videoId);
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { payment: true },
  });
  if (!video || video.creatorId !== user.id)
    throw new HttpError(404, "Submission not found.");
  if (["published", "publishing", "publish_queued"].includes(video.status))
    return json({ status: video.status, arweaveTx: video.arweaveTx });
  if (!publishingEnabled())
    throw new HttpError(503, "Permanent publishing is not open yet.");
  if (
    video.status !== "payment_received" ||
    video.payment?.status !== "verified"
  )
    throw new HttpError(409, "A verified payment is required.");
  await db.video.updateMany({
    where: { id: videoId, status: "payment_received" },
    data: { status: "publish_queued" },
  });
  return json({ status: "publish_queued" }, 202);
});
