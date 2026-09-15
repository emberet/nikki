import { randomBytes, createHash } from "crypto";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { api, appOrigin, HttpError } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = api(async (req) => {
  const { session, user } = await requireUser();
  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET)
    throw new HttpError(503, "X sign-in is not connected yet.");
  const state = randomBytes(24).toString("hex"),
    verifier = randomBytes(48).toString("base64url");
  const challenge = await db.authChallenge.create({
    data: { message: state, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  session.xState = state;
  session.xVerifier = verifier;
  session.xWallet = user.wallet;
  session.xChallengeId = challenge.id;
  await session.save();
  const url = new URL("https://x.com/i/oauth2/authorize");
  const params = {
    response_type: "code",
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: appOrigin(req) + "/api/auth/x/callback",
    scope: "tweet.read users.read",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url, 302);
});
