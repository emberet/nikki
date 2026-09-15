import { api, sameOrigin, jsonBody, id, json } from "@/lib/http";
import { requireUser } from "@/lib/session";
import {
  founderSubmission,
  founderServiceReady,
  founderMessage,
} from "@/lib/founder";
import { rateLimit } from "@/lib/rate-limit";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser();
  await rateLimit("founder-confirmation", user.id, 10);
  const video = await founderSubmission(
    id((await jsonBody(req)).videoId),
    user,
  );
  await founderServiceReady(Number(video.sizeBytes));
  const issuedAt = new Date().toISOString();
  return json({
    message: founderMessage(video, user.wallet, issuedAt),
    issuedAt,
    storageFunding: "project",
  });
});
