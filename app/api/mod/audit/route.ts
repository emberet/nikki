import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMod } from "@/lib/session";

export async function GET() {
  try {
    await requireMod();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const reviews = await db.review.findMany({
    include: { mod: true, video: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(
    reviews.map((r) => ({
      id: r.id,
      video: { id: r.video.id, title: r.video.title, arweaveTx: r.video.arweaveTx },
      mod: r.mod.wallet,
      decision: r.decision,
      reason: r.reason,
      createdAt: r.createdAt,
    }))
  );
}
