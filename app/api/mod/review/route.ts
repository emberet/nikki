import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { requireMod } from "@/lib/session";
import { publishToArweave } from "@/lib/irys";
import { refundSol } from "@/lib/solana";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request) {
  let mod;
  try {
    ({ user: mod } = await requireMod());
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { videoId, decision, reason } = await req.json();
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "bad decision" }, { status: 400 });
  }

  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { creator: true, payment: true },
  });
  if (!video || video.status !== "in_review" || !video.filePath) {
    return NextResponse.json({ error: "not in review" }, { status: 400 });
  }
  if (video.payment?.status !== "verified") {
    return NextResponse.json({ error: "payment not verified" }, { status: 400 });
  }

  if (decision === "approved") {
    let arweaveTx: string;
    try {
      arweaveTx = await publishToArweave({
        filePath: video.filePath,
        mimeType: video.mimeType,
        title: video.title,
        creatorWallet: video.creator.wallet,
        approverWallet: mod.wallet,
        sha256: video.sha256 || "",
        sizeBytes: Number(video.sizeBytes),
      });
    } catch (e) {
      return NextResponse.json(
        { error: `arweave publish failed: ${(e as Error).message}` },
        { status: 502 }
      );
    }

    await db.$transaction([
      db.video.update({
        where: { id: video.id },
        data: { status: "approved", arweaveTx, publishedAt: new Date(), filePath: null },
      }),
      db.review.create({
        data: { videoId: video.id, modId: mod.id, decision, reason: reason || "" },
      }),
    ]);
    const reward = BigInt(process.env.REVIEW_REWARD || "0");
    if (reward > 0n) {
      await db.rewardEntry.create({
        data: { modId: mod.id, amount: reward, reason: `review:${video.id}` },
      });
    }
    fs.rmSync(video.filePath, { force: true });
    return NextResponse.json({ ok: true, arweaveTx });
  }

  // rejection: delete held file, refund minus processing fee (SOL payments only)
  let refundTx: string | null = null;
  const fee = BigInt(process.env.REJECTION_FEE_LAMPORTS || "2000000");
  if (video.payment.currency === "SOL" && video.payment.amountLamports > fee) {
    try {
      refundTx = await refundSol(
        video.payment.payerWallet,
        video.payment.amountLamports - fee
      );
    } catch (e) {
      // refund failure must not block rejection; flag for manual payout
      console.error("refund failed", video.id, e);
    }
  }

  await db.$transaction([
    db.video.update({
      where: { id: video.id },
      data: { status: "rejected", filePath: null },
    }),
    db.review.create({
      data: { videoId: video.id, modId: mod.id, decision, reason: reason || "" },
    }),
    db.payment.update({
      where: { videoId: video.id },
      data: { status: refundTx ? "refunded" : "refund_pending", refundTx },
    }),
  ]);
  const reward = BigInt(process.env.REVIEW_REWARD || "0");
  if (reward > 0n) {
    await db.rewardEntry.create({
      data: { modId: mod.id, amount: reward, reason: `review:${video.id}` },
    });
  }
  fs.rmSync(video.filePath, { force: true });
  return NextResponse.json({ ok: true, refundTx });
}
