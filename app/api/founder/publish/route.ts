import { api, sameOrigin, jsonBody, id, json, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { queueFoundingRecord } from "@/lib/founder";
import { rateLimit } from "@/lib/rate-limit";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser();
  await rateLimit("founder-publish", user.id, 10);
  const body = await jsonBody(req);
  if (body.confirmPermanent !== true)
    throw new HttpError(400, "Confirm permanent publication.");
  return json(
    await queueFoundingRecord(
      id(body.videoId),
      user,
      body.signature,
      body.issuedAt,
    ),
    202,
  );
});
