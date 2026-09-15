import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, id, json, HttpError } from "@/lib/http";
import { ballotMessage } from "@/lib/governance";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    { videoId: raw, choice, reason = "" } = await jsonBody(req),
    videoId = id(raw);
  if (
    !user.xId ||
    !["yes", "no"].includes(choice) ||
    typeof reason !== "string" ||
    reason.length > 500
  )
    throw new HttpError(400, "Invalid ballot.");
  const video = await db.video.findUnique({ where: { id: videoId } }),
    member = await db.eligibleVoter.findUnique({
      where: { videoId_wallet: { videoId, wallet: user.wallet } },
    });
  if (
    !video ||
    video.status !== "voting" ||
    !video.voteClosesAt ||
    video.voteClosesAt.getTime() <= Date.now()
  )
    throw new HttpError(409, "Voting has closed.");
  if (!member || member.xId !== user.xId)
    throw new HttpError(
      403,
      "This wallet was not eligible when voting opened.",
    );
  const issuedAt = new Date().toISOString();
  return json({
    message: ballotMessage(
      video,
      user.wallet,
      user.xId,
      choice,
      reason,
      issuedAt,
    ),
    issuedAt,
  });
});
