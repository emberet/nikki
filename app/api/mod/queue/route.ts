import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMod } from "@/lib/session";

export async function GET() {
  try {
    await requireMod();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const videos = await db.video.findMany({
    where: { status: "in_review" },
    include: { creator: true, payment: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    videos.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description,
      creator: v.creator.wallet,
      sizeBytes: v.sizeBytes.toString(),
      sha256: v.sha256,
      mimeType: v.mimeType,
      paid: v.payment?.status === "verified",
      currency: v.payment?.currency,
      createdAt: v.createdAt,
    }))
  );
}
