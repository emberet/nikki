import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { requireMod } from "@/lib/session";

export const runtime = "nodejs";

// Streams a held (pre-approval) file to mods only, with range support.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireMod();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const video = await db.video.findUnique({ where: { id: params.id } });
  if (!video?.filePath || !fs.existsSync(video.filePath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const size = fs.statSync(video.filePath).size;
  const range = req.headers.get("range");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      start = parseInt(m[1]);
      if (m[2]) end = Math.min(parseInt(m[2]), size - 1);
      status = 206;
    }
  }

  const stream = fs.createReadStream(video.filePath, { start, end });
  const headers: Record<string, string> = {
    "Content-Type": video.mimeType,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
  };
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new NextResponse(stream as unknown as ReadableStream, { status, headers });
}
