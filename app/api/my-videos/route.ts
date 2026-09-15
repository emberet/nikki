import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const videos = await db.video.findMany({
    where: { creatorId: user.id },
    include: { payment: true, review: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    videos.map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      sizeBytes: v.sizeBytes.toString(),
      arweaveTx: v.arweaveTx,
      quoteLamports: v.payment?.quoteLamports.toString(),
      paymentStatus: v.payment?.status,
      refundTx: v.payment?.refundTx,
      rejectionReason: v.review?.decision === "rejected" ? v.review.reason : null,
      createdAt: v.createdAt,
    }))
  );
}
