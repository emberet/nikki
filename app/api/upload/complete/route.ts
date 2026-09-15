import { NextResponse } from "next/server";
import fs from "fs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { quoteLamports, tokenQuote } from "@/lib/quote";
import { treasuryPubkey } from "@/lib/solana";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { videoId } = await req.json();
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video || video.creatorId !== user.id || video.status !== "uploading" || !video.filePath) {
    return NextResponse.json({ error: "invalid video" }, { status: 400 });
  }

  const size = fs.statSync(video.filePath).size;
  if (size < 1024) {
    return NextResponse.json({ error: "file too small" }, { status: 400 });
  }

  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(video.filePath!)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve())
      .on("error", reject);
  });
  const sha256 = hash.digest("hex");

  const lamports = await quoteLamports(size);
  await db.video.update({
    where: { id: video.id },
    data: { status: "awaiting_payment", sizeBytes: BigInt(size), sha256 },
  });
  await db.payment.upsert({
    where: { videoId: video.id },
    update: { quoteLamports: lamports },
    create: {
      videoId: video.id,
      currency: "SOL",
      amountLamports: 0n,
      quoteLamports: lamports,
      payerWallet: user.wallet,
    },
  });

  return NextResponse.json({
    videoId: video.id,
    sizeBytes: size,
    sha256,
    quoteLamports: lamports.toString(),
    quoteToken: tokenQuote(lamports).toString(),
    treasury: treasuryPubkey().toBase58(),
  });
}
