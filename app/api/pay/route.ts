import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { connection, validPaymentTransaction } from "@/lib/solana";
import { api, sameOrigin, jsonBody, id, json, HttpError } from "@/lib/http";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { user } = await requireUser(),
    body = await jsonBody(req),
    videoId = id(body.videoId),
    signature = body.signature;
  await rateLimit("verify-payment", user.id, 10);
  if (
    body.currency !== "SOL" ||
    body.confirmPermanent !== true ||
    typeof signature !== "string" ||
    !/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)
  )
    throw new HttpError(
      400,
      "A SOL payment and permanent-publication confirmation are required.",
    );
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { payment: true, storageQuotes: true },
  });
  if (!video || video.creatorId !== user.id || !video.payment)
    throw new HttpError(404, "Payment record not found.");
  const payment = video.payment;
  if (payment.status === "verified") {
    if (payment.txSignature === signature)
      return json({ ok: true, status: video.status });
    throw new HttpError(409, "This record has already been paid for.");
  }
  if (video.status !== "approved" || !video.sha256)
    throw new HttpError(409, "No approved submission exists.");
  if (await db.payment.findUnique({ where: { txSignature: signature } }))
    throw new HttpError(409, "This transaction has already been used.");
  // Recording a previous payment remains available when new purchases are paused.
  const transaction = await connection().getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "finalized",
  });
  const quotes = [...video.storageQuotes];
  // Preserve recoverability of quotes created before the immutable-history migration.
  if (
    payment.expiresAt &&
    !quotes.some((q) => q.reference === payment.reference)
  )
    quotes.push({ ...payment, expiresAt: payment.expiresAt });
  const quote = quotes.find(
    (q) =>
      q.fileSha256 === video.sha256 &&
      q.quoteLamports > 0n &&
      validPaymentTransaction(transaction, {
        payer: user.wallet,
        recipient: q.recipient,
        expectedLamports: q.quoteLamports,
        reference: q.reference,
        createdAt: q.createdAt,
        expiresAt: q.expiresAt,
      }),
  );
  if (!quote)
    throw new HttpError(
      402,
      "The finalized SOL payment has not been verified. If you already paid, check the same transaction again; do not send another payment.",
    );
  await db.$transaction(async (tx) => {
    const claim = await tx.payment.updateMany({
      where: { id: payment.id, status: "pending", txSignature: null },
      data: {
        txSignature: signature,
        amountLamports: quote.quoteLamports,
        quoteLamports: quote.quoteLamports,
        reference: quote.reference,
        recipient: quote.recipient,
        createdAt: quote.createdAt,
        expiresAt: quote.expiresAt,
        fileSha256: quote.fileSha256,
        status: "verified",
        confirmedAt: new Date(),
      },
    });
    if (claim.count !== 1)
      throw new HttpError(409, "A payment has already been recorded.");
    const changed = await tx.video.updateMany({
      where: { id: videoId, status: "approved", sha256: quote.fileSha256 },
      data: { status: "payment_received" },
    });
    if (changed.count !== 1)
      throw new HttpError(409, "The submission state changed.");
  });
  return json({ ok: true, status: "payment_received" });
});
