import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  session.nonce = randomBytes(16).toString("hex");
  await session.save();
  return NextResponse.json({ nonce: session.nonce });
}
