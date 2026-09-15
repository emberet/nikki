import { requireWorkerReady } from "@/lib/health";
import { rateLimit } from "@/lib/rate-limit";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, sameOrigin, jsonBody, id, json, HttpError } from "@/lib/http";
import { finalizeElection } from "@/lib/governance";
import { quoteLamports } from "@/lib/quote";
import { paymentRecipient } from "@/lib/solana";
import { ensureStorageFunded, publishingEnabled } from "@/lib/storage";
import { archiveSizes } from "@/lib/archive";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    videoId = id((await jsonBody(req)).videoId);
  await rateLimit("storage-quote", user.id, 5);
  if (process.env.RELEASE_MODE === "founder")
    throw new HttpError(
      503,
      "Public storage payments are closed during the founder launch.",
    );
  await finalizeElection(videoId);
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { payment: true, creator: true, ballots: true },
  });
  if (
    !video ||
    video.creatorId !== user.id ||
    video.status !== "approved" ||
    !video.sha256
  )
    throw new HttpError(
      409,
      "Only approved submissions can receive a storage quote.",
    );
  if (!publishingEnabled())
    throw new HttpError(
      503,
      "Permanent publishing is not open yet. Your approval is saved.",
    );
  if (video.payment?.status === "verified")
    throw new HttpError(409, "A payment is already recorded.");
  if (process.env.RELEASE_MODE === "community") await requireWorkerReady();
  const recipient = paymentRecipient(),
    sizes = archiveSizes(video);
  await ensureStorageFunded(sizes);
  const existing = video.payment;
  if (
    existing &&
    existing.status === "pending" &&
    existing.expiresAt &&
    existing.expiresAt.getTime() > Date.now()
  )
    return json({
      videoId,
      quoteLamports: existing.quoteLamports.toString(),
      recipient: existing.recipient,
      reference: existing.reference,
      expiresAt: existing.expiresAt,
      sha256: video.sha256,
    });
  const amount = await quoteLamports(sizes),
    expiresAt = new Date(Date.now() + 15 * 60 * 1000),
    reference = "nikki:" + videoId + ":" + randomBytes(12).toString("hex"),
    createdAt = new Date();
  const payment = await db.$transaction(async (tx) => {
    const current = await tx.video.findUnique({
      where: { id: videoId },
      include: { payment: true },
    });
    if (
      current?.status !== "approved" ||
      current.payment?.status === "verified"
    )
      throw new HttpError(409, "A payment is already recorded.");
    if (current.payment?.expiresAt && current.payment.expiresAt > createdAt)
      return current.payment;
    const data = {
      quoteLamports: amount,
      recipient,
      reference,
      expiresAt,
      fileSha256: video.sha256!,
      createdAt,
    };
    // Every quote remains recoverable even after a replacement is issued.
    await tx.storageQuote.create({ data: { ...data, videoId } });
    return tx.payment.upsert({
      where: { videoId },
      create: {
        ...data,
        videoId,
        amountLamports: 0n,
        currency: "SOL",
        payerWallet: user.wallet,
      },
      update: data,
    });
  });
  return json({
    videoId,
    quoteLamports: payment.quoteLamports.toString(),
    recipient: payment.recipient,
    reference: payment.reference,
    expiresAt: payment.expiresAt,
    sha256: video.sha256,
  });
});
