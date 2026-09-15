import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { tokenBalance } from "@/lib/solana";

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gate = BigInt(process.env.UPLOAD_GATE_MIN || "0");
  if (gate > 0n && (await tokenBalance(user.wallet)) < gate) {
    return NextResponse.json(
      { error: "insufficient token balance to upload" },
      { status: 403 }
    );
  }

  const { title, description, mimeType } = await req.json();
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!/^video\//.test(mimeType || "")) {
    return NextResponse.json({ error: "video files only" }, { status: 400 });
  }

  const video = await db.video.create({
    data: {
      title: title.slice(0, 200),
      description: (description || "").slice(0, 5000),
      mimeType,
      creatorId: user.id,
      status: "uploading",
    },
  });

  const heldDir = path.resolve(process.env.HELD_DIR || "./held");
  fs.mkdirSync(heldDir, { recursive: true });
  const filePath = path.join(heldDir, `${video.id}.bin`);
  fs.writeFileSync(filePath, "");
  await db.video.update({ where: { id: video.id }, data: { filePath } });

  return NextResponse.json({ videoId: video.id });
}
