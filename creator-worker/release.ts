import { session } from "./auth";
import {
  ApiError,
  body,
  json,
  limit,
  now,
  random,
  text,
  origin,
  wallet,
} from "./common";
import { checkMainnet, confirmIntent, connection } from "./chain";
import type { Env } from "./types";

const historyColumns =
  "id,kind,mint,status,signature,estimated_lamports,created_at";
export async function transactionsPaused(env: Env) {
  return !!(
    await env.CREATORS_DB.prepare(
      "SELECT transactions_paused FROM creator_flags WHERE id=1",
    ).first<{ transactions_paused: number }>()
  )?.transactions_paused;
}
async function archive(env: Env) {
  const response = await env.ASSETS.fetch(
    new Request(origin(env) + "/archive.json"),
  );
  if (!response.ok)
    throw new ApiError(503, "The archive is temporarily unavailable.");
  return ((await response.json()) as { records: Array<{ arweaveTx: string }> })
    .records;
}
export async function releaseApi(
  req: Request,
  env: Env,
  route: string,
): Promise<Response | null> {
  if (!/^\/(transactions|support|ops|library)(\/|$)/.test(route)) return null;
  const current = await session(req, env),
    address = current.user!.wallet;
  if (route.startsWith("/ops")) {
    if (!env.FOUNDER_WALLET || address !== env.FOUNDER_WALLET)
      throw new ApiError(403, "This page is for the Nikki founder.");
    await limit(env, "ops", address, 30);
    if (route === "/ops/overview" && req.method === "GET") {
      const [counts, tickets, transactions, audit, paused] = await Promise.all([
        env.CREATORS_DB.prepare(
          `SELECT (SELECT count(*) FROM creator_profiles WHERE published=1) AS channels,(SELECT count(*) FROM creator_tokens WHERE status='verified') AS tokens,(SELECT count(*) FROM creator_tickets WHERE status!='resolved') AS openTickets,(SELECT count(*) FROM creator_intents WHERE status IN ('prepared','submitted') AND created_at<?) AS pendingTransactions,(SELECT coalesce(sum(bytes),0) FROM creator_assets) AS imageBytes,(SELECT count(*) FROM creator_users) AS users,(SELECT count(*) FROM communities WHERE state='hidden') AS hiddenCommunities,(SELECT (SELECT count(*) FROM channel_posts WHERE state='hidden')+(SELECT count(*) FROM community_posts WHERE state='hidden')) AS hiddenPosts`,
        )
          .bind(now() - 600)
          .first(),
        env.CREATORS_DB.prepare(
          "SELECT * FROM creator_tickets ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,created_at DESC LIMIT 50",
        ).all(),
        env.CREATORS_DB.prepare(
          `SELECT wallet,${historyColumns} FROM creator_intents ORDER BY created_at DESC,rowid DESC LIMIT 50`,
        ).all(),
        env.CREATORS_DB.prepare(
          "SELECT action,target,detail,created_at FROM creator_ops_audit ORDER BY created_at DESC,rowid DESC LIMIT 20",
        ).all(),
        transactionsPaused(env),
      ]);
      return json({
        counts,
        tickets: tickets.results,
        transactions: transactions.results,
        audit: audit.results,
        paused,
        checkedAt: now(),
        imageStorageEnabled: !!env.CREATOR_MEDIA,
      });
    }
    if (route === "/ops/health" && req.method === "POST") {
      await limit(env, "health", address, 3);
      await checkMainnet(connection(env));
      return json({
        database: "connected",
        solana: "mainnet connected",
        xConfigured: !!env.X_CLIENT_ID && !!env.X_CLIENT_SECRET,
        imagesConfigured: !!env.CREATOR_MEDIA,
        checkedAt: now(),
      });
    }
    if (route === "/ops/flags" && req.method === "POST") {
      const data = await body(req);
      if (typeof data.paused !== "boolean")
        throw new ApiError(400, "Choose pause or resume.");
      await env.CREATORS_DB.batch([
        env.CREATORS_DB.prepare(
          "INSERT INTO creator_flags(id,transactions_paused) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET transactions_paused=excluded.transactions_paused",
        ).bind(data.paused ? 1 : 0),
        env.CREATORS_DB.prepare(
          "INSERT INTO creator_ops_audit VALUES(?,?,?,?,?,?)",
        ).bind(
          random(),
          address,
          "transactions",
          "platform",
          data.paused ? "paused" : "resumed",
          now(),
        ),
      ]);
      return json({ paused: data.paused });
    }
    if (route === "/ops/ticket" && req.method === "POST") {
      const data = await body(req),
        id = text(data.id, 64, 64, "Ticket"),
        status = text(data.status, 1, 20, "Status"),
        reply = text(data.reply, 1, 1500, "Reply");
      if (!["open", "reviewing", "resolved"].includes(status))
        throw new ApiError(400, "Choose a listed status.");
      if (
        !(await env.CREATORS_DB.prepare(
          "SELECT id FROM creator_tickets WHERE id=?",
        )
          .bind(id)
          .first())
      )
        throw new ApiError(404, "Ticket not found.");
      await env.CREATORS_DB.batch([
        env.CREATORS_DB.prepare(
          "UPDATE creator_tickets SET status=?,reply=?,updated_at=? WHERE id=?",
        ).bind(status, reply, now(), id),
        env.CREATORS_DB.prepare(
          "INSERT INTO creator_ops_audit VALUES(?,?,?,?,?,?)",
        ).bind(
          random(),
          address,
          "ticket",
          id,
          JSON.stringify({ status, reply }),
          now(),
        ),
      ]);
      return json({ saved: true });
    }
    if (route === "/ops/channels" && req.method === "GET") {
      const url = new URL(req.url),
        q = text(url.searchParams.get("q") || "", 0, 100, "Search"),
        offsetRaw = url.searchParams.get("offset") || "0";
      if (!/^\d{1,6}$/.test(offsetRaw))
        throw new ApiError(400, "Choose a valid page.");
      const offset = Number(offsetRaw);
      const rows = await env.CREATORS_DB.prepare(
        `SELECT p.wallet,p.handle,p.display_name,p.category,p.published,p.moderated_at,p.moderated_by,p.created_at,u.x_username,t.status AS token_status,t.mint
         FROM creator_profiles p JOIN creator_users u ON u.wallet=p.wallet
         LEFT JOIN creator_tokens t ON t.wallet=p.wallet AND t.status='verified'
         WHERE (?='' OR instr(lower(p.handle),lower(?))>0 OR instr(lower(p.display_name),lower(?))>0 OR instr(lower(coalesce(u.x_username,'')),lower(?))>0 OR p.wallet=?)
         ORDER BY p.created_at DESC,p.wallet LIMIT 26 OFFSET ?`,
      )
        .bind(q, q, q, q, q, offset)
        .all();
      return json({
        channels: rows.results.slice(0, 25),
        nextOffset: rows.results.length > 25 ? offset + 25 : null,
      });
    }
    if (route === "/ops/channel" && req.method === "POST") {
      const data = await body(req),
        target = wallet(data.wallet);
      if (typeof data.published !== "boolean")
        throw new ApiError(400, "Choose publish or unpublish.");
      const result = await env.CREATORS_DB.prepare(
        "UPDATE creator_profiles SET published=?,moderated_at=?,moderated_by=? WHERE wallet=?",
      )
        .bind(data.published ? 1 : 0, now(), address, target)
        .run();
      if (!result.meta.changes) throw new ApiError(404, "Channel not found.");
      await env.CREATORS_DB.prepare(
        "INSERT INTO creator_ops_audit VALUES(?,?,?,?,?,?)",
      )
        .bind(
          random(),
          address,
          "channel-publish",
          target,
          data.published ? "published" : "unpublished",
          now(),
        )
        .run();
      return json({ published: data.published });
    }
    if (route === "/ops/communities" && req.method === "GET") {
      const url = new URL(req.url),
        q = text(url.searchParams.get("q") || "", 0, 100, "Search"),
        offsetRaw = url.searchParams.get("offset") || "0";
      if (!/^\d{1,6}$/.test(offsetRaw))
        throw new ApiError(400, "Choose a valid page.");
      const offset = Number(offsetRaw);
      const rows = await env.CREATORS_DB.prepare(
        `SELECT c.mint,c.name,c.token_symbol,c.owner_wallet,c.state,c.moderated_at,c.moderated_by,c.created_at,u.x_username AS owner_x_username,
         (SELECT count(*) FROM community_members m WHERE m.mint=c.mint) AS member_count,
         (SELECT count(*) FROM community_posts p WHERE p.mint=c.mint AND p.state='visible') AS post_count
         FROM communities c JOIN creator_users u ON u.wallet=c.owner_wallet
         WHERE (?='' OR instr(lower(c.name),lower(?))>0 OR instr(lower(c.token_symbol),lower(?))>0 OR c.mint=? OR c.owner_wallet=?)
         ORDER BY c.created_at DESC,c.mint LIMIT 26 OFFSET ?`,
      )
        .bind(q, q, q, q, q, offset)
        .all();
      return json({
        communities: rows.results.slice(0, 25),
        nextOffset: rows.results.length > 25 ? offset + 25 : null,
      });
    }
    if (route === "/ops/community" && req.method === "POST") {
      const data = await body(req),
        target = wallet(data.mint),
        state = text(data.state, 1, 20, "State");
      if (!["visible", "hidden"].includes(state))
        throw new ApiError(400, "Choose visible or hidden.");
      const result = await env.CREATORS_DB.prepare(
        "UPDATE communities SET state=?,moderated_at=?,moderated_by=? WHERE mint=?",
      )
        .bind(state, now(), address, target)
        .run();
      if (!result.meta.changes) throw new ApiError(404, "Community not found.");
      await env.CREATORS_DB.prepare(
        "INSERT INTO creator_ops_audit VALUES(?,?,?,?,?,?)",
      )
        .bind(random(), address, "community-state", target, state, now())
        .run();
      return json({ state });
    }
    if (route === "/ops/posts" && req.method === "GET") {
      const url = new URL(req.url),
        offsetRaw = url.searchParams.get("offset") || "0";
      if (!/^\d{1,6}$/.test(offsetRaw))
        throw new ApiError(400, "Choose a valid page.");
      const offset = Number(offsetRaw);
      const rows = await env.CREATORS_DB.prepare(
        `SELECT * FROM (
           SELECT 'channel' AS kind,p.id,p.wallet,p.text,p.state,p.created_at,cp.handle AS ref,cp.display_name AS target,u.x_username
           FROM channel_posts p JOIN creator_users u ON u.wallet=p.wallet
           LEFT JOIN creator_profiles cp ON cp.wallet=p.channel_wallet
           UNION ALL
           SELECT 'community' AS kind,p.id,p.wallet,p.text,p.state,p.created_at,p.mint AS ref,c.name AS target,u.x_username
           FROM community_posts p JOIN creator_users u ON u.wallet=p.wallet
           LEFT JOIN communities c ON c.mint=p.mint
         ) ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET ?`,
      )
        .bind(offset)
        .all();
      return json({
        posts: rows.results.slice(0, 25),
        nextOffset: rows.results.length > 25 ? offset + 25 : null,
      });
    }
    if (route === "/ops/reconcile" && req.method === "POST") {
      const data = await body(req),
        id = text(data.id, 64, 64, "Transaction");
      const intent = await env.CREATORS_DB.prepare(
        "SELECT wallet FROM creator_intents WHERE id=?",
      )
        .bind(id)
        .first<{ wallet: string }>();
      if (!intent) throw new ApiError(404, "Transaction not found.");
      const result = await confirmIntent(env, intent.wallet, id);
      await env.CREATORS_DB.prepare(
        "INSERT INTO creator_ops_audit VALUES(?,?,?,?,?,?)",
      )
        .bind(random(), address, "reconcile", id, result.status, now())
        .run();
      return json(result);
    }
  }
  if (route === "/transactions" && req.method === "GET") {
    const offset = Number(new URL(req.url).searchParams.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
      throw new ApiError(400, "Invalid page.");
    const rows = await env.CREATORS_DB.prepare(
      `SELECT ${historyColumns} FROM creator_intents WHERE wallet=? ORDER BY created_at DESC,rowid DESC LIMIT 26 OFFSET ?`,
    )
      .bind(address, offset)
      .all();
    return json({
      transactions: rows.results.slice(0, 25),
      nextOffset: rows.results.length > 25 ? offset + 25 : null,
    });
  }
  if (route === "/support" && req.method === "GET") {
    const rows = await env.CREATORS_DB.prepare(
      "SELECT id,category,target_handle,message,status,reply,created_at,updated_at FROM creator_tickets WHERE wallet=? ORDER BY created_at DESC,rowid DESC LIMIT 30",
    )
      .bind(address)
      .all();
    return json({ tickets: rows.results });
  }
  if (route === "/support" && req.method === "POST") {
    await limit(env, "support", address, 5, 86400);
    const data = await body(req),
      category = text(data.category, 1, 40, "Topic"),
      message = text(data.message, 15, 2000, "Message"),
      handle = text(data.handle || "", 0, 24, "Channel handle").toLowerCase();
    if (
      ![
        "Account help",
        "Transaction help",
        "Impersonation",
        "Misleading token claims",
        "Video report",
        "Community report",
        "Other",
      ].includes(category)
    )
      throw new ApiError(400, "Choose a listed topic.");
    const target = handle
      ? await env.CREATORS_DB.prepare(
          `SELECT p.wallet,t.mint FROM creator_profiles p LEFT JOIN creator_tokens t ON t.wallet=p.wallet AND t.status='verified' WHERE p.handle=? AND p.published=1`,
        )
          .bind(handle)
          .first<{ wallet: string; mint: string | null }>()
      : null;
    if (handle && !target)
      throw new ApiError(
        404,
        "That channel handle was not found. Leave it empty for general help.",
      );
    const id = random();
    await env.CREATORS_DB.prepare(
      "INSERT INTO creator_tickets(id,wallet,category,target_handle,target_wallet,target_mint,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        address,
        category,
        handle,
        target?.wallet || null,
        target?.mint || null,
        message,
        now(),
        now(),
      )
      .run();
    return json({ id, status: "open" }, 201);
  }
  if (route === "/library" && req.method === "GET") {
    const rows = await env.CREATORS_DB.prepare(
      "SELECT record_id,position,saved,updated_at FROM creator_library WHERE wallet=? ORDER BY updated_at DESC LIMIT 500",
    )
      .bind(address)
      .all();
    return json({ items: rows.results });
  }
  if (route === "/library" && req.method === "POST") {
    await limit(env, "library", address, 10);
    const data = await body(req),
      id = text(data.recordId, 43, 43, "Record");
    if (!(await archive(env)).some((r) => r.arweaveTx === id))
      throw new ApiError(404, "Only preserved Nikki records can be saved.");
    const position = data.position;
    if (
      position !== undefined &&
      (typeof position !== "number" ||
        !Number.isFinite(position) ||
        position < 0 ||
        position > 604800)
    )
      throw new ApiError(400, "Playback position is invalid.");
    if (data.saved !== undefined && typeof data.saved !== "boolean")
      throw new ApiError(400, "Choose save or remove.");
    if (position === undefined && data.saved === undefined)
      throw new ApiError(400, "Choose a library action.");
    try {
      await env.CREATORS_DB.prepare(
        "INSERT INTO creator_library(wallet,record_id,position,saved,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(wallet,record_id) DO UPDATE SET position=coalesce(?,creator_library.position),saved=coalesce(?,creator_library.saved),updated_at=excluded.updated_at",
      )
        .bind(
          address,
          id,
          position ?? 0,
          data.saved === true ? 1 : 0,
          now(),
          position ?? null,
          data.saved === undefined ? null : data.saved ? 1 : 0,
        )
        .run();
    } catch (error) {
      if (String(error).includes("LIBRARY_FULL"))
        throw new ApiError(
          409,
          "Your library is full. Remove an item from your library to make room.",
        );
      throw error;
    }
    if (data.saved === false || position === 0)
      await env.CREATORS_DB.prepare(
        "DELETE FROM creator_library WHERE wallet=? AND record_id=? AND saved=0 AND position=0",
      )
        .bind(address, id)
        .run();
    return json({ saved: true });
  }
  throw new ApiError(404, "This action is not available.");
}
