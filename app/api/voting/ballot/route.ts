import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, id, json, HttpError } from "@/lib/http";
import { ballotMessage, finalizeElection } from "@/lib/governance";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    {
      videoId: raw,
      choice,
      reason = "",
      signature,
      issuedAt,
    } = await jsonBody(req),
    videoId = id(raw);
  if (
    !user.xId ||
    !["yes", "no"].includes(choice) ||
    typeof reason !== "string" ||
    reason.length > 500 ||
    typeof signature !== "string" ||
    typeof issuedAt !== "string"
  )
    throw new HttpError(
      400,
      "A linked X account and a signed yes/no vote are required.",
    );
  const issuedMs = Date.parse(issuedAt);
  if (
    !Number.isFinite(issuedMs) ||
    Math.abs(Date.now() - issuedMs) > 5 * 60 * 1000
  )
    throw new HttpError(400, "This ballot expired. Please sign a new vote.");
  await finalizeElection(videoId);
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (
    !video ||
    video.status !== "voting" ||
    !video.voteClosesAt ||
    video.voteClosesAt.getTime() <= Date.now()
  )
    throw new HttpError(409, "Voting has closed.");
  const member = await db.eligibleVoter.findUnique({
    where: { videoId_wallet: { videoId, wallet: user.wallet } },
  });
  if (!member || member.xId !== user.xId)
    throw new HttpError(
      403,
      "Your wallet and X account were not eligible when this vote opened.",
    );
  const message = ballotMessage(
    video,
    user.wallet,
    user.xId,
    choice,
    reason,
    issuedAt,
  );
  let valid = false;
  try {
    valid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      new PublicKey(user.wallet).toBytes(),
    );
  } catch {}
  if (!valid)
    throw new HttpError(401, "The ballot signature could not be verified.");
  await db.$transaction(async (tx) => {
    const current = await tx.video.findUniqueOrThrow({
      where: { id: videoId },
    });
    if (
      current.status !== "voting" ||
      !current.voteClosesAt ||
      current.voteClosesAt.getTime() <= Date.now()
    )
      throw new HttpError(409, "Voting has closed.");
    const prior = await tx.ballot.findUnique({
      where: { videoId_wallet: { videoId, wallet: user.wallet } },
    });
    if (prior?.signature === signature) return;
    if (prior) {
      const old = prior.message.match(/\nIssued: ([^\n]+)/)?.[1];
      if (old && Date.parse(old) >= issuedMs)
        throw new HttpError(409, "A newer ballot has already been recorded.");
    }
    const data = {
      choice,
      reason,
      signature,
      message,
      xId: user.xId!,
      xUsername: member.xUsername,
    };
    await tx.ballot.upsert({
      where: { videoId_wallet: { videoId, wallet: user.wallet } },
      create: { ...data, videoId, wallet: user.wallet },
      update: data,
    });
  });
  return json({ ok: true });
});
