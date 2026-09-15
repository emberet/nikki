import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, id, json } from "@/lib/http";
import { openElection } from "@/lib/governance";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser();
  const videoId = id((await jsonBody(req)).videoId);
  await openElection(videoId, user.id);
  return json({ ok: true, status: "voting" });
});
