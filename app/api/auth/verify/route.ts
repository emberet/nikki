import { rateLimit } from "@/lib/rate-limit";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import {
  api,
  sameOrigin,
  jsonBody,
  HttpError,
  clientIp,
  json,
} from "@/lib/http";
export const POST = api(async (req) => {
  sameOrigin(req);
  const { wallet, signature } = await jsonBody(req),
    session = await getSession();
  if (
    typeof wallet !== "string" ||
    wallet.length > 64 ||
    typeof signature !== "string" ||
    signature.length > 100
  )
    throw new HttpError(400, "Invalid wallet signature.");
  await rateLimit("auth-verify", clientIp(req) + ":" + wallet, 30);
  await rateLimit("auth-verify", "global", 600);
  const challenge = session.challengeId
    ? await db.authChallenge.findUnique({ where: { id: session.challengeId } })
    : null;
  if (
    !challenge ||
    challenge.used ||
    challenge.expiresAt.getTime() <= Date.now()
  )
    throw new HttpError(401, "Sign-in request expired. Please try again.");
  let ok = false;
  try {
    const pub = new PublicKey(wallet);
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(challenge.message),
      bs58.decode(signature),
      pub.toBytes(),
    );
  } catch {}
  if (!ok) throw new HttpError(401, "Wallet signature could not be verified.");
  const user = await db.$transaction(async (tx) => {
    const claim = await tx.authChallenge.updateMany({
      where: { id: challenge.id, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (claim.count !== 1)
      throw new HttpError(401, "Sign-in request already used.");
    return tx.user.upsert({
      where: { wallet },
      update: { role: "creator" },
      create: { wallet, role: "creator" },
    });
  });
  session.wallet = wallet;
  session.userId = user.id;
  session.challengeId = undefined;
  session.xState = undefined;
  session.xVerifier = undefined;
  session.xWallet = undefined;
  session.xChallengeId = undefined;
  await session.save();
  return json({ ok: true });
});
