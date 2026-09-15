import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TOTAL = 20 * 1024 ** 3; // 20 GB hard cap

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const videoId = url.searchParams.get("videoId");
  const offset = Number(url.searchParams.get("offset"));
  if (!videoId || !Number.isFinite(offset)) {
    return NextResponse.json({ error: "videoId+offset required" }, { status: 400 });
  }

  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video || video.creatorId !== user.id || video.status !== "uploading" || !video.filePath) {
    return NextResponse.json({ error: "invalid video" }, { status: 400 });
  }

  const current = fs.statSync(video.filePath).size;
  if (offset !== current) {
    // client out of sync — tell it where to resume
    return NextResponse.json({ error: "offset mismatch", expected: current }, { status: 409 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (current + buf.length > MAX_TOTAL) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }
  fs.appendFileSync(video.filePath, buf);
  return NextResponse.json({ received: current + buf.length });
}
