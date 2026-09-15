import nacl from "tweetnacl";
import bs58 from "bs58";
import type { Env, CreatorUser } from "./types";
import {
  ApiError,
  body,
  cookie,
  hash,
  json,
  limit,
  now,
  origin,
  random,
  setCookie,
  wallet,
} from "./common";
export async function session(req: Request, env: Env, required = true) {
  const raw = cookie(req, "nikki_creator");
  const tokenHash = await hash(raw);
  const user = raw
    ? await env.CREATORS_DB.prepare(
        "SELECT u.* FROM creator_users u JOIN creator_sessions s ON u.wallet=s.wallet WHERE s.token_hash=? AND s.expires_at>?",
      )
        .bind(tokenHash, now())
        .first<CreatorUser>()
    : null;
  if (!user && required)
    throw new ApiError(401, "Connect and sign in with your wallet.");
  return { user, tokenHash };
}
export async function auth(
  req: Request,
  env: Env,
  route: string,
): Promise<Response | null> {
  if (route === "/auth/challenge" && req.method === "POST") {
    const data = await body(req),
      address = wallet(data.wallet);
    await limit(env, "wallet-challenge", address, 10);
    const id = random(),
      browser = random(),
      expiry = now() + 300;
    const message = `Sign in to Nikki\nOrigin: ${origin(env)}\nWallet: ${address}\nNonce: ${id}\nExpires: ${new Date(expiry * 1000).toISOString()}\nThis signature signs you in. It does not create a token, transfer funds, or approve a transaction.`;
    await env.CREATORS_DB.prepare(
      "INSERT INTO creator_challenges(id,wallet,message,browser_hash,expires_at) VALUES(?,?,?,?,?)",
    )
      .bind(id, address, message, await hash(browser), expiry)
      .run();
    return json({ id, message }, 200, {
      "Set-Cookie": setCookie(env, "nikki_challenge", browser, 300),
    });
  }
  if (route === "/auth/verify" && req.method === "POST") {
    const data = await body(req);
    if (
      typeof data.id !== "string" ||
      data.id.length !== 64 ||
      typeof data.signature !== "string" ||
      data.signature.length > 100
    )
      throw new ApiError(400, "The sign-in confirmation is invalid.");
    const challenge = await env.CREATORS_DB.prepare(
      "SELECT * FROM creator_challenges WHERE id=? AND expires_at>? AND used=0",
    )
      .bind(data.id, now())
      .first<{ wallet: string; message: string; browser_hash: string }>();
    if (
      !challenge ||
      challenge.browser_hash !== (await hash(cookie(req, "nikki_challenge")))
    )
      throw new ApiError(
        403,
        "This sign-in request expired. Please reconnect.",
      );
    let valid = false;
    try {
      valid = nacl.sign.detached.verify(
        new TextEncoder().encode(challenge.message),
        bs58.decode(data.signature),
        bs58.decode(challenge.wallet),
      );
    } catch {}
    if (!valid)
      throw new ApiError(403, "Your wallet signature could not be verified.");
    const claim = await env.CREATORS_DB.prepare(
      "UPDATE creator_challenges SET used=1 WHERE id=? AND used=0 AND expires_at>?",
    )
      .bind(data.id, now())
      .run();
    if (claim.meta.changes !== 1)
      throw new ApiError(409, "This sign-in request was already used.");
    const token = random();
    await env.CREATORS_DB.batch([
      env.CREATORS_DB.prepare(
        "INSERT INTO creator_users(wallet,created_at) VALUES(?,?) ON CONFLICT(wallet) DO NOTHING",
      ).bind(challenge.wallet, now()),
      env.CREATORS_DB.prepare(
        "INSERT INTO creator_sessions(token_hash,wallet,expires_at) VALUES(?,?,?)",
      ).bind(await hash(token), challenge.wallet, now() + 86400),
    ]);
    return json({ wallet: challenge.wallet }, 200, {
      "Set-Cookie": setCookie(env, "nikki_creator", token),
    });
  }
  if (route === "/auth/logout" && req.method === "POST") {
    const current = await session(req, env, false);
    await env.CREATORS_DB.prepare(
      "DELETE FROM creator_sessions WHERE token_hash=?",
    )
      .bind(current.tokenHash)
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": setCookie(env, "nikki_creator", "", 0),
    });
  }
  if (route === "/auth/x/start" && req.method === "GET") {
    if (req.headers.get("sec-fetch-site") === "cross-site")
      throw new ApiError(403, "Start X verification from your Nikki studio.");
    const current = await session(req, env);
    if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET)
      throw new ApiError(
        503,
        "X verification is being connected. Your wallet and draft can still be saved.",
      );
    const state = random(),
      verifier = random();
    await env.CREATORS_DB.prepare(
      "INSERT INTO creator_oauth(state_hash,session_hash,wallet,verifier,expires_at) VALUES(?,?,?,?,?)",
    )
      .bind(
        await hash(state),
        current.tokenHash,
        current.user!.wallet,
        verifier,
        now() + 600,
      )
      .run();
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...digest))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const url = new URL("https://x.com/i/oauth2/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: env.X_CLIENT_ID,
      redirect_uri: origin(env) + "/api/creators/auth/x/callback",
      scope: "tweet.read users.read",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return Response.redirect(url, 302);
  }
  if (route === "/auth/x/callback" && req.method === "GET") {
    const current = await session(req, env),
      url = new URL(req.url),
      state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    if (!state || state.length !== 64)
      throw new ApiError(400, "X confirmation is invalid.");
    const row = await env.CREATORS_DB.prepare(
      "DELETE FROM creator_oauth WHERE state_hash=? AND session_hash=? AND wallet=? AND expires_at>? RETURNING verifier",
    )
      .bind(await hash(state), current.tokenHash, current.user!.wallet, now())
      .first<{ verifier: string }>();
    if (!row)
      throw new ApiError(400, "X confirmation expired or was already used.");
    if (url.searchParams.has("error") || !code)
      return Response.redirect(
        origin(env) + "/creator-studio/?x=cancelled",
        302,
      );
    if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET)
      throw new ApiError(503, "X verification is not configured.");
    const response = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " + btoa(env.X_CLIENT_ID + ":" + env.X_CLIENT_SECRET),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: origin(env) + "/api/creators/auth/x/callback",
        code_verifier: row.verifier,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        "X verification failed. Return to your studio and try again.",
      );
    const token = (await response.json()) as { access_token?: string };
    if (!token.access_token)
      throw new ApiError(502, "X returned an invalid confirmation.");
    const profileResponse = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: "Bearer " + token.access_token },
      signal: AbortSignal.timeout(15000),
    });
    if (!profileResponse.ok)
      throw new ApiError(
        502,
        "X could not confirm your account. Check your X app’s API access.",
      );
    const { data } = (await profileResponse.json()) as {
      data?: { id: string; username: string };
    };
    if (!data || !/^\d+$/.test(data.id) || !/^\w{1,15}$/.test(data.username))
      throw new ApiError(502, "X returned an invalid account.");
    if (current.user!.x_id && current.user!.x_id !== data.id)
      throw new ApiError(
        409,
        "This wallet is already paired with another X account.",
      );
    const linked = await env.CREATORS_DB.prepare(
      "UPDATE creator_users SET x_id=?,x_username=?,x_linked_at=COALESCE(x_linked_at,?) WHERE wallet=? AND (x_id IS NULL OR x_id=?)",
    )
      .bind(data.id, data.username, now(), current.user!.wallet, data.id)
      .run();
    if (linked.meta.changes !== 1)
      throw new ApiError(
        409,
        "This wallet was paired with another X account. Refresh your studio.",
      );
    await env.CREATORS_DB.prepare(
      "UPDATE creator_users SET x_username=? WHERE x_id=?",
    )
      .bind(data.username, data.id)
      .run();
    return Response.redirect(origin(env) + "/creator-studio/?x=connected", 302);
  }
  return null;
}
