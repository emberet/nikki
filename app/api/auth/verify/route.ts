import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { getSession, modWallets } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { wallet, signature } = await req.json();
  const session = await getSession();
  if (!session.nonce) {
    return NextResponse.json({ error: "no nonce" }, { status: 400 });
  }
  const message = new TextEncoder().encode(
    `Sign in to ForeverVid\nNonce: ${session.nonce}`
  );
  const ok = nacl.sign.detached.verify(
    message,
    bs58.decode(signature),
    bs58.decode(wallet)
  );
  if (!ok) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const role = modWallets().includes(wallet) ? "mod" : "creator";
  const user = await db.user.upsert({
    where: { wallet },
    update: { role },
    create: { wallet, role },
  });

  session.wallet = wallet;
  session.userId = user.id;
  session.role = user.role;
  session.nonce = undefined;
  await session.save();
  return NextResponse.json({ ok: true, role: user.role });
}
