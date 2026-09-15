import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const videos = await db.video.findMany({
    where: { status: "approved" },
    include: { creator: true },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });
  return NextResponse.json(
    videos.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description,
      creator: v.creator.wallet,
      arweaveTx: v.arweaveTx,
      sizeBytes: v.sizeBytes.toString(),
      publishedAt: v.publishedAt,
    }))
  );
}
