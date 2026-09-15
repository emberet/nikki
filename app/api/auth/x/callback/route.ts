import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { api, appOrigin, HttpError } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = api(async (req) => {
  const { session, user } = await requireUser();
  const url = new URL(req.url),
    state = url.searchParams.get("state"),
    code = url.searchParams.get("code");
  if (
    !state ||
    state !== session.xState ||
    !session.xVerifier ||
    session.xWallet !== user.wallet ||
    !session.xChallengeId
  )
    throw new HttpError(400, "X sign-in request expired or invalid.");
  const verifier = session.xVerifier,
    challengeId = session.xChallengeId;
  session.xState = undefined;
  session.xVerifier = undefined;
  session.xWallet = undefined;
  session.xChallengeId = undefined;
  await session.save();
  const claim = await db.authChallenge.updateMany({
    where: {
      id: challengeId,
      used: false,
      expiresAt: { gt: new Date() },
      message: state,
    },
    data: { used: true },
  });
  if (claim.count !== 1)
    throw new HttpError(400, "X sign-in request already used.");
  if (url.searchParams.has("error") || !code)
    return Response.redirect(appOrigin(req) + "/mod?x=cancelled", 302);
  const clientId = process.env.X_CLIENT_ID,
    secret = process.env.X_CLIENT_SECRET;
  if (!clientId || !secret)
    throw new HttpError(503, "X sign-in is not configured.");
  const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(clientId + ":" + secret).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: appOrigin(req) + "/api/auth/x/callback",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!tokenResponse.ok)
    throw new HttpError(
      502,
      "X sign-in could not be completed. Please try again.",
    );
  const token = await tokenResponse.json();
  if (typeof token.access_token !== "string")
    throw new HttpError(502, "X returned an invalid sign-in response.");
  const profileResponse = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: "Bearer " + token.access_token },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!profileResponse.ok)
    throw new HttpError(502, "Your X account could not be verified.");
  const { data } = await profileResponse.json();
  if (!data || typeof data.id !== "string" || typeof data.username !== "string")
    throw new HttpError(502, "X returned an invalid account.");
  // Existing identity cannot be swapped during an election. A stable X ID is linked once.
  if (user.xId && user.xId !== data.id)
    throw new HttpError(
      409,
      "This wallet is already linked to another X account.",
    );
  await db.user.update({
    where: { id: user.id },
    data: {
      xId: data.id,
      xUsername: data.username,
      xLinkedAt: user.xLinkedAt || new Date(),
    },
  });
  return Response.redirect(appOrigin(req) + "/mod?x=connected", 302);
});
