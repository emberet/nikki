import { contentMediaApi, cleanupContentMedia } from "./content-media";
import { channelPostsApi } from "./channel-posts";
import { communitiesApi } from "./communities";
import { releaseApi, transactionsPaused } from "./release";
import { storagePricing } from "./storage-pricing";
import { mediaApi, cleanupMedia } from "./media";
import { cachedHoldings, edgeCache, publicCacheKey, limitRead } from "./cache";
import { PublicKey } from "@solana/web3.js";
import { auth, session } from "./auth";
import {
  ApiError,
  body,
  escape,
  hash,
  json,
  limit,
  now,
  origin,
  sameOrigin,
  text,
  wallet,
} from "./common";
import {
  confirmIntent,
  connection,
  feeSummary,
  holdings,
  prepareIntent,
  submitIntent,
} from "./chain";
import type { CreatorToken, Env, Intent, Profile } from "./types";

const publicSelect = `SELECT p.wallet,p.handle,p.display_name,p.bio,p.category,p.accent,p.avatar_id,p.banner_id,p.created_at,u.x_id,u.x_username,t.mint,t.name AS token_name,t.symbol AS token_symbol,t.verified_at FROM creator_profiles p JOIN creator_users u ON u.wallet=p.wallet LEFT JOIN creator_tokens t ON t.wallet=p.wallet AND t.status='verified' WHERE p.published=1 AND u.x_id IS NOT NULL`;
const accents = ["purple", "lime", "pink", "blue"];
const categories = ["History", "Knowledge", "Culture"];
async function ownedToken(env: Env, address: string) {
  const token = await env.CREATORS_DB.prepare(
    "SELECT * FROM creator_tokens WHERE wallet=? AND status!='abandoned'",
  )
    .bind(address)
    .first<CreatorToken>();
  if (!token) throw new ApiError(404, "Create a token draft first.");
  return token;
}
async function cleanup(env: Env) {
  await env.CREATORS_DB.batch([
    env.CREATORS_DB.prepare(
      "DELETE FROM creator_challenges WHERE expires_at<?",
    ).bind(now()),
    env.CREATORS_DB.prepare(
      "DELETE FROM creator_sessions WHERE expires_at<?",
    ).bind(now()),
    env.CREATORS_DB.prepare(
      "DELETE FROM creator_oauth WHERE expires_at<?",
    ).bind(now()),
    env.CREATORS_DB.prepare(
      "DELETE FROM creator_rates WHERE expires_at<?",
    ).bind(now()),
  ]);
}
async function api(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url),
    route =
      url.pathname.replace(/^\/api\/creators/, "").replace(/\/$/, "") || "/";
  if (route === "/storage-pricing") return storagePricing(req);
  if (route === "/config")
    return json({
      accountsEnabled: !!env.CREATORS_DB,
      xEnabled: !!env.X_CLIENT_ID && !!env.X_CLIENT_SECRET,
      launchEnabled:
        env.TOKEN_LAUNCH_ENABLED === "true" &&
        !!env.X_CLIENT_ID &&
        !!env.X_CLIENT_SECRET,
      provider: "pump.fun",
      imagesEnabled: !!env.CREATOR_MEDIA,
      videosPublic: true,
    });
  if (!env.CREATORS_DB)
    throw new ApiError(
      503,
      "Creator accounts are being connected. Please check back shortly.",
    );
  if (req.method !== "GET") sameOrigin(req, env);
  const ip = req.headers.get("cf-connecting-ip") || "local";
  if (req.method !== "GET" || route.startsWith("/auth"))
    await limit(env, "api", ip, 120);
  const extension =
    (await contentMediaApi(req, env, route)) ||
    (await channelPostsApi(req, env, route)) ||
    (await communitiesApi(req, env, route)) ||
    (await mediaApi(req, env, route)) ||
    (await releaseApi(req, env, route));
  if (extension) return extension;
  const authentication = await auth(req, env, route);
  if (authentication) return authentication;
  if (route === "/me" && req.method === "GET") {
    const current = await session(req, env, false);
    if (!current.user) return json({ user: null });
    const address = current.user.wallet;
    const [profile, token, intent] = await Promise.all([
      env.CREATORS_DB.prepare("SELECT * FROM creator_profiles WHERE wallet=?")
        .bind(address)
        .first<Profile>(),
      env.CREATORS_DB.prepare(
        "SELECT * FROM creator_tokens WHERE wallet=? AND status!='abandoned'",
      )
        .bind(address)
        .first<CreatorToken>(),
      env.CREATORS_DB.prepare(
        "SELECT id,kind,mint,status,signature,last_valid_height,created_at FROM creator_intents WHERE wallet=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
        .bind(address)
        .first(),
    ]);
    return json({
      user: {
        wallet: address,
        xVerified: !!current.user.x_id,
        xUsername: current.user.x_username,
        isFounder: !!env.FOUNDER_WALLET && address === env.FOUNDER_WALLET,
      },
      profile,
      token,
      intent,
    });
  }
  if (route === "/channels" && req.method === "GET") {
    const q = (url.searchParams.get("q") || "").slice(0, 100).trim(),
      category = url.searchParams.get("category") || "",
      cursor = Number(url.searchParams.get("offset") || 0);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > 10000)
      throw new ApiError(400, "Invalid page.");
    const conditions = [],
      bindings: unknown[] = [];
    if (q) {
      conditions.push(
        "(instr(lower(p.display_name),lower(?))>0 OR instr(lower(p.bio),lower(?))>0 OR instr(lower(p.handle),lower(?))>0 OR instr(lower(u.x_username),lower(?))>0)",
      );
      bindings.push(q, q, q, q);
    }
    if (categories.includes(category)) {
      conditions.push("p.category=?");
      bindings.push(category);
    }
    const result = await env.CREATORS_DB.prepare(
      publicSelect +
        (conditions.length ? " AND " + conditions.join(" AND ") : "") +
        " ORDER BY p.created_at DESC,p.wallet LIMIT 26 OFFSET ?",
    )
      .bind(...bindings, cursor)
      .all();
    return json({
      channels: result.results.slice(0, 25),
      nextOffset: result.results.length > 25 ? cursor + 25 : null,
    });
  }
  if (/^\/channels\/[a-z0-9_]{3,24}$/.test(route) && req.method === "GET") {
    const handle = route.split("/")[2];
    const profile = await env.CREATORS_DB.prepare(
      publicSelect + " AND p.handle=?",
    )
      .bind(handle)
      .first();
    if (!profile)
      throw new ApiError(404, "This creator channel is not published yet.");
    return json({ channel: profile });
  }
  if (route === "/profile" && req.method === "POST") {
    const current = await session(req, env),
      address = current.user!.wallet;
    await limit(env, "profile", address, 20, 3600);
    const data = await body(req),
      handle = text(data.handle, 3, 24, "Handle").toLowerCase();
    if (
      !/^[a-z][a-z0-9_]{2,23}$/.test(handle) ||
      [
        "admin",
        "nikki",
        "support",
        "official",
        "help",
        "api",
        "creators",
      ].includes(handle)
    )
      throw new ApiError(
        400,
        "Choose a handle beginning with a letter, using letters, numbers, or underscores. Official names are reserved.",
      );
    const name = text(data.displayName, 1, 50, "Channel name"),
      bio = text(data.bio, 0, 500, "Bio"),
      category = text(data.category, 1, 30, "Category"),
      accent = text(data.accent, 1, 20, "Color");
    if (!categories.includes(category) || !accents.includes(accent))
      throw new ApiError(400, "Choose a listed category and color.");
    const published = data.published === true ? 1 : 0;
    if (published && !current.user!.x_id)
      throw new ApiError(
        409,
        "Verify your X account before publishing your channel.",
      );
    const previous = await env.CREATORS_DB.prepare(
      "SELECT handle FROM creator_profiles WHERE wallet=?",
    )
      .bind(address)
      .first<{ handle: string }>();
    if (previous && previous.handle !== handle)
      throw new ApiError(
        409,
        "Your channel handle stays fixed so existing links keep working.",
      );
    try {
      await env.CREATORS_DB.prepare(
        "INSERT INTO creator_profiles(wallet,handle,display_name,bio,category,accent,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(wallet) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,category=excluded.category,accent=excluded.accent,published=excluded.published,updated_at=excluded.updated_at",
      )
        .bind(
          address,
          handle,
          name,
          bio,
          category,
          accent,
          published,
          now(),
          now(),
        )
        .run();
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        throw new ApiError(
          409,
          "That handle is already taken. Choose another.",
        );
      throw error;
    }
    return json({ saved: true, published: !!published, handle });
  }
  if (route === "/subscriptions" && req.method === "GET") {
    const current = await session(req, env);
    await limit(env, "holdings", current.user!.wallet, 6);
    const { balances, checkedAt } = await cachedHoldings(
      env,
      current.user!.wallet,
    );
    const positive = [...balances]
      .filter(([, amount]) => amount > 0n)
      .map(([mint]) => mint);
    const result = await env.CREATORS_DB.prepare(
      publicSelect +
        " AND t.mint IN (SELECT value FROM json_each(?)) ORDER BY p.created_at DESC LIMIT 250",
    )
      .bind(JSON.stringify(positive))
      .all();
    return json({
      channels: result.results.map((row) => ({
        ...row,
        balanceRaw: balances.get(String(row.mint))!.toString(),
      })),
      checkedAt,
    });
  }

  if (/^\/membership\/[a-z0-9_]{3,24}$/.test(route) && req.method === "GET") {
    const current = await session(req, env);
    await limit(env, "membership", current.user!.wallet, 8);
    const profile = await env.CREATORS_DB.prepare(
      publicSelect + " AND p.handle=?",
    )
      .bind(route.split("/")[2])
      .first<{ mint: string | null }>();
    if (!profile) throw new ApiError(404, "Channel not found.");
    if (!profile.mint) return json({ subscribed: false, reason: "no_token" });
    const { balances, checkedAt } = await cachedHoldings(
      env,
      current.user!.wallet,
      profile.mint,
    );
    const balance = balances.get(profile.mint) || 0n;
    return json({
      subscribed: balance > 0n,
      balanceRaw: balance.toString(),
      checkedAt,
    });
  }
  const metadataMatch = route.match(
    /^\/tokens\/([1-9A-HJ-NP-Za-km-z]{32,44})\/(metadata|image)$/,
  );
  if (metadataMatch && req.method === "GET") {
    const token = await env.CREATORS_DB.prepare(
      "SELECT * FROM creator_tokens WHERE mint=?",
    )
      .bind(metadataMatch[1])
      .first<CreatorToken>();
    if (!token) throw new ApiError(404, "Token draft not found.");
    if (metadataMatch[2] === "image") {
      const colors: Record<string, string> = {
        purple: "#9945ff",
        lime: "#d6ff65",
        pink: "#ff90cb",
        blue: "#83c8ff",
      };
      const letters =
        token.symbol
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 3)
          .toUpperCase() || "N";
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0a0a0c"/><rect x="35" y="35" width="442" height="442" fill="${colors[token.accent] || colors.purple}" stroke="#ececf1" stroke-width="12"/><text x="256" y="290" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="140" fill="#0a0a0c">${escape(letters)}</text><text x="256" y="438" text-anchor="middle" font-family="monospace" font-size="28" fill="#0a0a0c">NIKKI CREATOR</text></svg>`,
        {
          headers: {
            "Content-Type": "image/svg+xml",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public,max-age=86400",
          },
        },
      );
    }
    return json(
      {
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        image: origin(env) + `/api/creators/tokens/${token.mint}/image`,
        showName: true,
        createdOn: "https://pump.fun",
        twitter: "https://x.com/" + token.x_username,
        website: origin(env) + "/creators/",
      },
      200,
      { "Cache-Control": "public,max-age=86400" },
    );
  }
  if (route === "/token/draft" && req.method === "POST") {
    const current = await session(req, env);
    if (!current.user!.x_id)
      throw new ApiError(409, "Verify X before preparing a creator token.");
    const profile = await env.CREATORS_DB.prepare(
      "SELECT * FROM creator_profiles WHERE wallet=? AND published=1",
    )
      .bind(current.user!.wallet)
      .first<Profile>();
    if (!profile)
      throw new ApiError(409, "Publish your creator channel first.");
    await limit(env, "token-draft", current.user!.wallet, 10, 3600);
    const data = await body(req),
      mint = wallet(data.mint),
      name = text(data.name, 1, 32, "Token name"),
      symbol = text(data.symbol, 1, 13, "Symbol").toUpperCase(),
      description = text(data.description, 1, 500, "Token description");
    if (new TextEncoder().encode(name).length > 32)
      throw new ApiError(
        400,
        "Token names must fit within 32 UTF-8 bytes. Shorten the name, especially when using emoji.",
      );
    if (!/^[A-Z0-9]{1,13}$/.test(symbol))
      throw new ApiError(400, "Use letters and numbers for the token symbol.");
    const previous = await env.CREATORS_DB.prepare(
      "SELECT * FROM creator_tokens WHERE wallet=? AND status!='abandoned'",
    )
      .bind(current.user!.wallet)
      .first<CreatorToken>();
    if (previous) {
      if (previous.mint === mint) return json({ token: previous });
      throw new ApiError(
        409,
        "A token draft or launch already exists for your channel. Resume it first.",
      );
    }
    const uri = origin(env) + `/api/creators/tokens/${mint}/metadata`;
    await env.CREATORS_DB.prepare(
      "INSERT INTO creator_tokens(mint,wallet,name,symbol,description,accent,x_username,metadata_uri,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        mint,
        current.user!.wallet,
        name,
        symbol,
        description,
        profile.accent,
        current.user!.x_username,
        uri,
        now(),
      )
      .run();
    return json({ token: await ownedToken(env, current.user!.wallet) });
  }
  if (route === "/token/abandon" && req.method === "POST") {
    const current = await session(req, env),
      token = await ownedToken(env, current.user!.wallet);
    if (token.status !== "draft")
      throw new ApiError(409, "A launched token cannot be replaced.");
    const c = connection(env),
      height = await c.getBlockHeight("finalized");
    const active = await env.CREATORS_DB.prepare(
      "SELECT id FROM creator_intents WHERE wallet=? AND mint=? AND kind='launch' AND last_valid_height>=? AND status NOT IN ('failed') LIMIT 1",
    )
      .bind(current.user!.wallet, token.mint, height)
      .first();
    if (active)
      throw new ApiError(
        409,
        "A launch transaction may still be valid. Wait for it to expire, then check again.",
      );
    if (await c.getAccountInfo(new PublicKey(token.mint), "finalized"))
      throw new ApiError(
        409,
        "This mint exists on Solana. Recover its launch instead of replacing it.",
      );
    const changed = await env.CREATORS_DB.prepare(
      "UPDATE creator_tokens SET status='abandoned' WHERE mint=? AND wallet=? AND status='draft' AND NOT EXISTS(SELECT 1 FROM creator_intents WHERE creator_intents.mint=creator_tokens.mint AND kind='launch' AND last_valid_height>=? AND status IN ('prepared','submitted'))",
    )
      .bind(token.mint, current.user!.wallet, height)
      .run();
    if (changed.meta.changes !== 1)
      throw new ApiError(
        409,
        "A launch was prepared while checking this draft. Wait and check its status.",
      );
    return json({ abandoned: true });
  }
  if (route === "/fees" && req.method === "GET") {
    const current = await session(req, env);
    await limit(env, "fees", current.user!.wallet, 6);
    const token = await ownedToken(env, current.user!.wallet);
    if (token.status !== "verified")
      throw new ApiError(
        409,
        "Creator fees become available after your token launches.",
      );
    return json(await feeSummary(env, token));
  }
  if (route === "/transaction/prepare" && req.method === "POST") {
    const current = await session(req, env);
    if (!current.user!.x_id)
      throw new ApiError(409, "Verify your X account first.");
    if (env.TOKEN_LAUNCH_ENABLED !== "true" || (await transactionsPaused(env)))
      throw new ApiError(
        503,
        "Token transactions are not open yet. Your channel and draft are saved.",
      );
    await limit(env, "prepare", current.user!.wallet, 5);
    const data = await body(req),
      kind = data.kind;
    if (kind !== "launch" && kind !== "claim")
      throw new ApiError(400, "Choose launch or claim.");
    const token = await ownedToken(env, current.user!.wallet);
    if (
      (kind === "launch" && token.status !== "draft") ||
      (kind === "claim" && token.status !== "verified")
    )
      throw new ApiError(409, "This action does not match your token’s state.");
    return json(await prepareIntent(env, current.user!.wallet, token, kind));
  }
  if (route === "/transaction/submit" && req.method === "POST") {
    const current = await session(req, env);
    if (env.TOKEN_LAUNCH_ENABLED !== "true" || (await transactionsPaused(env)))
      throw new ApiError(503, "New token transactions are paused.");
    await limit(env, "submit", current.user!.wallet, 10);
    const data = await body(req);
    return json(
      await submitIntent(
        env,
        current.user!.wallet,
        text(data.id, 64, 64, "Transaction"),
        data.transaction,
      ),
    );
  }
  if (route === "/transaction/status" && req.method === "POST") {
    const current = await session(req, env);
    await limit(env, "confirmation", current.user!.wallet, 20);
    const data = await body(req);
    return json(
      await confirmIntent(
        env,
        current.user!.wallet,
        text(data.id, 64, 64, "Transaction"),
      ),
    );
  }
  throw new ApiError(404, "This action is not available.");
}
export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/creators")) {
      try {
        const cacheable =
          req.method === "GET" &&
          /^\/api\/creators\/channels(?:\/[a-z0-9_]{3,24})?\/?$/.test(
            url.pathname,
          );
        const cache = cacheable ? edgeCache() : undefined;
        const cacheKey = publicCacheKey(url);
        const hit = await cache?.match(cacheKey);
        if (hit) return hit;
        if (req.method === "GET")
          limitRead(req.headers.get("cf-connecting-ip") || "local");
        const response = await api(req, env);
        if (cache && response.ok) {
          response.headers.set("Cache-Control", "public,max-age=15");
          ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
        }
        if (env.CREATORS_DB && Math.random() < 0.01)
          ctx.waitUntil(
            Promise.all([
              cleanup(env),
              cleanupMedia(env),
              cleanupContentMedia(env),
            ]).catch(() => {}),
          );
        return response;
      } catch (error) {
        const requestId = crypto.randomUUID();
        if (url.pathname === "/api/creators/auth/x/callback")
          return new Response(
            `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reconnect X — Nikki</title><link rel="stylesheet" href="/theme.css"></head><body><main class="container"><section class="page-header"><h1>Let’s get you back.</h1><p>X verification could not be completed. Return to the same wallet browser where you started, open your studio, and choose Verify X again.</p><p>Your saved channel is still here.</p><a class="btn btn-primary" href="/creator-studio/">Back to your studio ↗</a><a class="btn" href="/help/">Get help</a></section></main></body></html>`,
            {
              status: error instanceof ApiError ? error.status : 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy":
                  "default-src 'self'; frame-ancestors 'none'; base-uri 'none'",
              },
            },
          );
        if (error instanceof ApiError)
          return json(
            { error: error.message, requestId },
            error.status,
            error.status === 429 ? { "Retry-After": "60" } : {},
          );
        console.error(
          "Creator request failed",
          requestId,
          url.pathname,
          error instanceof Error ? error.name : "Unknown",
        );
        return json(
          {
            error:
              "This service could not complete the request. Please try again shortly.",
            requestId,
          },
          503,
        );
      }
    }
    if (/^\/communities\/[1-9A-HJ-NP-Za-km-z]{32,44}\/?$/.test(url.pathname)) {
      try {
        limitRead(req.headers.get("cf-connecting-ip") || "local");
        const mint = url.pathname.split("/")[2];
        const community = env.CREATORS_DB
          ? await env.CREATORS_DB.prepare(
              "SELECT name,description FROM communities WHERE mint=?",
            )
              .bind(mint)
              .first<{ name: string; description: string }>()
          : null;
        if (!community)
          return new Response("Community not found.", {
            status: 404,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
            },
          });
        const asset = await env.ASSETS.fetch(
          new Request(new URL("/communities/_community/", url), req),
        );
        const title = escape(community.name + " — Nikki"),
          canonical = escape(origin(env) + "/communities/" + mint + "/");
        const html = (await asset.text())
          .replace(/<title>.*?<\/title>/, () => "<title>" + title + "</title>")
          .replace(
            /(<meta name="description" content=")[^"]*/,
            (_all, prefix) => prefix + escape(community.description),
          )
          .replace(
            /(<meta property="og:title" content=")[^"]*/,
            (_all, prefix) => prefix + title,
          )
          .replace(
            /(<meta property="og:description" content=")[^"]*/,
            (_all, prefix) => prefix + escape(community.description),
          )
          .replace(
            /(<(?:link rel="canonical" href|meta property="og:url" content)=")[^"]*/g,
            (_all, prefix) => prefix + canonical,
          );
        const headers = new Headers(asset.headers);
        for (const key of ["Content-Length", "ETag", "Last-Modified"])
          headers.delete(key);
        headers.set("Cache-Control", "no-store");
        headers.set(
          "Content-Security-Policy",
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests",
        );
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Referrer-Policy", "no-referrer");
        return new Response(html, { status: asset.status, headers });
      } catch (error) {
        return new Response(
          error instanceof ApiError
            ? error.message
            : "This community is temporarily unavailable. Please try again.",
          {
            status: error instanceof ApiError ? error.status : 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      }
    }
    if (/^\/c\/[a-z0-9_]{3,24}\/?$/.test(url.pathname)) {
      try {
        limitRead(req.headers.get("cf-connecting-ip") || "local");
      } catch {
        return json(
          { error: "Too many requests. Please try again shortly." },
          429,
          { "Retry-After": "60" },
        );
      }
      const handle = url.pathname.split("/")[2];
      const profile = env.CREATORS_DB
        ? await env.CREATORS_DB.prepare(publicSelect + " AND p.handle=?")
            .bind(handle)
            .first<Profile>()
        : null;
      if (!profile) {
        url.pathname = "/404.html";
        const asset = await env.ASSETS.fetch(new Request(url));
        return new Response(asset.body, {
          status: 404,
          headers: asset.headers,
        });
      }
      url.pathname = "/c/";
      const asset = await env.ASSETS.fetch(new Request(url));
      const title = escape(profile.display_name + " — Nikki");
      const canonical = escape(origin(env) + "/c/" + handle + "/");
      const html = (await asset.text())
        .replace(/<title>.*?<\/title>/, () => `<title>${title}</title>`)
        .replace(
          /(<meta (?:name="description"|property="og:description") content=")[^"]*/g,
          (_all, prefix) => prefix + escape(profile.bio),
        )
        .replace(
          /(<meta property="og:title" content=")[^"]*/,
          (_all, prefix) => prefix + title,
        )
        .replace(
          /(<(?:link rel="canonical" href|meta property="og:url" content)=")[^"]*/g,
          (_all, prefix) => prefix + canonical,
        );
      const headers = new Headers(asset.headers);
      headers.delete("Content-Length");
      headers.delete("ETag");
      headers.delete("Last-Modified");
      headers.set("Cache-Control", "no-store");
      return new Response(html, { status: asset.status, headers });
    }
    const asset = await env.ASSETS.fetch(req);
    if (/^\/communities(?:\/|$)/.test(url.pathname)) {
      const headers = new Headers(asset.headers);
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests",
      );
      headers.set("Referrer-Policy", "no-referrer");
      return new Response(asset.body, { status: asset.status, headers });
    }
    return asset;
  },
};
