import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { verifyPayment } from "@/lib/solana";
import { tokenQuote } from "@/lib/quote";

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { videoId, signature, currency } = await req.json();
  if (currency !== "SOL" && currency !== "TOKEN") {
    return NextResponse.json({ error: "bad currency" }, { status: 400 });
  }
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { payment: true },
  });
  if (!video || video.creatorId !== user.id || video.status !== "awaiting_payment" || !video.payment) {
    return NextResponse.json({ error: "invalid video" }, { status: 400 });
  }

  const existing = await db.payment.findUnique({ where: { txSignature: signature } });
  if (existing) {
    return NextResponse.json({ error: "signature already used" }, { status: 409 });
  }

  const expected =
    currency === "SOL"
      ? video.payment.quoteLamports
      : tokenQuote(video.payment.quoteLamports);
  if (expected <= 0n) {
    return NextResponse.json({ error: "currency unavailable" }, { status: 400 });
  }

  const ok = await verifyPayment({
    signature,
    payer: user.wallet,
    expectedLamports: expected,
    currency,
  });
  if (!ok) {
    return NextResponse.json({ error: "payment not verified" }, { status: 402 });
  }

  await db.payment.update({
    where: { videoId: video.id },
    data: {
      txSignature: signature,
      amountLamports: expected,
      currency,
      status: "verified",
      payerWallet: user.wallet,
    },
  });
  await db.video.update({ where: { id: video.id }, data: { status: "in_review" } });

  return NextResponse.json({ ok: true, status: "in_review" });
}
