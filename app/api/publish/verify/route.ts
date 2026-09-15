import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, id, json, HttpError } from "@/lib/http";
import { db } from "@/lib/db";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    videoId = id((await jsonBody(req)).videoId);
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video || video.creatorId !== user.id)
    throw new HttpError(404, "Record not found.");
  return json({
    status: video.status,
    arweaveTx: video.arweaveTx,
    message:
      video.publicationError ||
      "The preservation worker will check both permanent records automatically.",
  });
});
