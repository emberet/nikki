import { rateLimit } from "@/lib/rate-limit";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { api, appOrigin, clientIp, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = api(async (req) => {
  await rateLimit("auth-challenge", clientIp(req), 30);
  await rateLimit("auth-challenge", "global", 600);
  const session = await getSession();
  if (session.challengeId)
    await db.authChallenge.deleteMany({ where: { id: session.challengeId } });
  const nonce = randomBytes(24).toString("hex"),
    expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const message =
    "Sign in to Nikki\nOrigin: " +
    appOrigin(req) +
    "\nNonce: " +
    nonce +
    "\nExpires: " +
    expiresAt.toISOString();
  const challenge = await db.authChallenge.create({
    data: { message, expiresAt },
  });
  session.challengeId = challenge.id;
  await session.save();
  return json({ message });
});
