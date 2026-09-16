import { session } from "./auth";
import {
  ApiError,
  body,
  json,
  limit,
  now,
  random,
  text,
  wallet,
} from "./common";
import { resolveCommunityToken, safeCommunityUrl } from "./community-token";
import type { CreatorUser, Env } from "./types";

type ImportRole = "token-authority" | "community-led";
interface CommunityRow {
  mint: string;
  owner_wallet: string;
  owner_x_username: string | null;
  name: string;
  description: string;
  logo_url: string;
  website_url: string;
  x_url: string;
  telegram_url: string;
  accent: string;
  token_name: string;
  token_symbol: string;
  metadata_uri: string;
  import_role: ImportRole;
  authority_wallet: string | null;
  authority_kind: string | null;
  authority_verified_at: number | null;
  created_at: number;
  updated_at: number;
  member_count: number;
  post_count: number;
}
interface PostRow {
  id: number;
  mint: string;
  wallet: string;
  client_id: string;
  text: string;
  state: string;
  created_at: number;
  display_name: string | null;
  handle: string | null;
  avatar_id: string | null;
  x_username: string | null;
}
const communitySelect = `SELECT c.*,u.x_username AS owner_x_username,
  (SELECT count(*) FROM community_members m WHERE m.mint=c.mint) AS member_count,
  (SELECT count(*) FROM community_posts p WHERE p.mint=c.mint AND p.state='visible') AS post_count
  FROM communities c JOIN creator_users u ON u.wallet=c.owner_wallet`;
const postSelect = `SELECT p.*,u.x_username,cp.display_name,cp.handle,cp.avatar_id
  FROM community_posts p JOIN creator_users u ON u.wallet=p.wallet
  LEFT JOIN creator_profiles cp ON cp.wallet=p.wallet AND cp.published=1`;
function community(row: CommunityRow) {
  return {
    mint: row.mint,
    name: row.name,
    description: row.description,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    xUrl: row.x_url,
    telegramUrl: row.telegram_url,
    accent: row.accent,
    tokenName: row.token_name,
    tokenSymbol: row.token_symbol,
    ownerWallet: row.owner_wallet,
    ownerXUsername: row.owner_x_username,
    importRole: row.import_role,
    authorityKind: row.authority_kind,
    authorityVerifiedAt: row.authority_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberCount: row.member_count,
    postCount: row.post_count,
  };
}
function canModerate(env: Env, user: CreatorUser | null, row: CommunityRow) {
  return (
    !!user &&
    (user.wallet === row.owner_wallet || user.wallet === env.FOUNDER_WALLET)
  );
}
function post(row: PostRow, user: CreatorUser | null, moderator: boolean) {
  return {
    id: String(row.id),
    text: row.text,
    createdAt: row.created_at,
    author: {
      wallet: row.wallet,
      displayName:
        row.display_name ||
        (row.x_username ? "@" + row.x_username : row.wallet.slice(0, 6)),
      handle: row.handle,
      xUsername: row.x_username,
      avatarUrl: row.avatar_id ? "/api/creators/media/" + row.avatar_id : null,
    },
    canDelete: user?.wallet === row.wallet,
    canModerate: moderator && user?.wallet !== row.wallet,
  };
}
async function findCommunity(env: Env, mint: string) {
  const row = await env.CREATORS_DB.prepare(communitySelect + " WHERE c.mint=?")
    .bind(mint)
    .first<CommunityRow>();
  if (!row) throw new ApiError(404, "This community hasn't arrived yet.");
  return row;
}
function paired(user: CreatorUser | null): asserts user is CreatorUser {
  if (!user) throw new ApiError(401, "Connect and sign in with your wallet.");
  if (!user.x_id)
    throw new ApiError(403, "Pair your wallet with X in Creator Studio first.");
}
function profileUrl(value: unknown, label: string, hosts?: string[]) {
  if (value === undefined || value === "") return "";
  const input = text(value, 0, 2048, label);
  if (!input) return "";
  const valueUrl = safeCommunityUrl(input);
  if (
    !valueUrl ||
    (hosts && !hosts.includes(new URL(valueUrl).hostname.toLowerCase()))
  )
    throw new ApiError(
      400,
      `${label} must be a public HTTPS ${hosts ? hosts.join(" or ") + " " : ""}URL.`,
    );
  return valueUrl;
}
function profile(data: Record<string, unknown>) {
  const name = text(data.name, 1, 80, "Community name"),
    description = text(data.description ?? "", 0, 1000, "Description"),
    accent = typeof data.accent === "string" ? data.accent : "purple";
  if (!["purple", "lime", "pink", "blue"].includes(accent))
    throw new ApiError(400, "Choose a community colour.");
  return {
    name,
    description,
    accent,
    logoUrl: profileUrl(data.logoUrl, "Logo"),
    websiteUrl: profileUrl(data.websiteUrl, "Website"),
    xUrl: profileUrl(data.xUrl, "X link", [
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
    ]),
    telegramUrl: profileUrl(data.telegramUrl, "Telegram link", [
      "t.me",
      "telegram.me",
      "www.t.me",
      "www.telegram.me",
    ]),
  };
}
function positiveId(value: string, label: string) {
  if (!/^[1-9]\d{0,14}$/.test(value))
    throw new ApiError(400, `${label} is invalid.`);
  const id = Number(value);
  if (!Number.isSafeInteger(id))
    throw new ApiError(400, `${label} is invalid.`);
  return id;
}
function quotaError(error: unknown): never {
  const message = String(error);
  if (/COMMUNITIES_OWNER_FULL/.test(message))
    throw new ApiError(
      409,
      "You can organize up to 10 communities during the early release.",
    );
  if (/COMMUNITY_MEMBERS_OWNER_FULL/.test(message))
    throw new ApiError(
      409,
      "You can join up to 200 communities during the early release.",
    );
  if (/COMMUNITY_POSTS_OWNER_FULL/.test(message))
    throw new ApiError(
      409,
      "You've reached the early-release post allowance. Contact Nikki for help.",
    );
  if (
    /COMMUNITIES_FULL|COMMUNITY_MEMBERS_FULL|COMMUNITY_POSTS_FULL|COMMUNITY_FEED_FULL/.test(
      message,
    )
  )
    throw new ApiError(
      503,
      "This community feature has reached its early-release capacity. Please contact Nikki.",
    );
  throw error;
}

export async function communitiesApi(
  req: Request,
  env: Env,
  route: string,
  resolveToken = resolveCommunityToken,
): Promise<Response | null> {
  if (!/^\/communities(?:\/|$)/.test(route)) return null;
  const url = new URL(req.url);
  if (route === "/communities" && req.method === "GET") {
    const q = text(url.searchParams.get("q") || "", 0, 100, "Search"),
      offsetRaw = url.searchParams.get("offset") || "0";
    if (!/^\d{1,6}$/.test(offsetRaw))
      throw new ApiError(400, "Choose a valid page.");
    const offset = Number(offsetRaw);
    // Literal substring search: '%' and '_' do not become SQL wildcards.
    const where =
      " WHERE (?='' OR instr(lower(c.name),lower(?))>0 OR instr(lower(c.token_name),lower(?))>0 OR instr(lower(c.token_symbol),lower(?))>0 OR c.mint=?)";
    const [rows, count] = await Promise.all([
      env.CREATORS_DB.prepare(
        communitySelect + where + " ORDER BY c.id ASC LIMIT 25 OFFSET ?",
      )
        .bind(q, q, q, q, q, offset)
        .all<CommunityRow>(),
      env.CREATORS_DB.prepare("SELECT count(*) AS n FROM communities c" + where)
        .bind(q, q, q, q, q)
        .first<{ n: number }>(),
    ]);
    const total = count?.n || 0;
    return json({
      communities: rows.results.map(community),
      total,
      nextOffset:
        offset + rows.results.length < total
          ? offset + rows.results.length
          : null,
    });
  }
  const current = await session(req, env, req.method !== "GET"),
    user = current.user;
  if (route === "/communities/preview" && req.method === "POST") {
    paired(user);
    const data = await body(req),
      mint = wallet(data.mint);
    await limit(env, "community-preview", user.wallet, 8);
    await limit(env, "community-preview-x", user.x_id!, 8);
    const existing = await env.CREATORS_DB.prepare(
      communitySelect + " WHERE c.mint=?",
    )
      .bind(mint)
      .first<CommunityRow>();
    if (existing)
      return json({
        token: {
          mint,
          name: existing.token_name,
          symbol: existing.token_symbol,
          description: existing.description,
          logoUrl: existing.logo_url,
          websiteUrl: existing.website_url,
          xUrl: existing.x_url,
          telegramUrl: existing.telegram_url,
        },
        eligibility: { canImport: false, role: null },
        existingCommunity: mint,
        warnings: ["This token already has a Nikki community."],
      });
    const token = await resolveToken(env, mint, user.wallet),
      role: ImportRole | null = token.actorIsAuthority
        ? "token-authority"
        : token.actorIsHolder
          ? "community-led"
          : null;
    return json({
      token: {
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        logoUrl: token.logoUrl,
        websiteUrl: token.websiteUrl,
        xUrl: token.xUrl,
        telegramUrl: token.telegramUrl,
      },
      eligibility: { canImport: !!role, role },
      existingCommunity: null,
      warnings: token.warnings,
    });
  }
  if (route === "/communities" && req.method === "POST") {
    paired(user);
    const data = await body(req),
      mint = wallet(data.mint),
      draft = profile(data);
    await limit(env, "community-import", user.wallet, 3, 3600);
    await limit(env, "community-import-x", user.x_id!, 3, 3600);
    if (
      await env.CREATORS_DB.prepare("SELECT mint FROM communities WHERE mint=?")
        .bind(mint)
        .first()
    )
      throw new ApiError(
        409,
        "This token already has a Nikki community. Open it from Communities.",
      );
    // Recheck chain eligibility at creation; never trust preview values from the browser.
    const token = await resolveToken(env, mint, user.wallet),
      role: ImportRole | null = token.actorIsAuthority
        ? "token-authority"
        : token.actorIsHolder
          ? "community-led"
          : null;
    if (!role)
      throw new ApiError(
        403,
        "Import a token you hold or control. Your connected wallet could not be verified for this token.",
      );
    const timestamp = now();
    try {
      await env.CREATORS_DB.batch([
        env.CREATORS_DB.prepare(
          `INSERT INTO communities(mint,owner_wallet,name,description,logo_url,website_url,x_url,telegram_url,accent,token_name,token_symbol,metadata_uri,import_role,authority_wallet,authority_kind,authority_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          mint,
          user.wallet,
          draft.name,
          draft.description,
          draft.logoUrl,
          draft.websiteUrl,
          draft.xUrl,
          draft.telegramUrl,
          draft.accent,
          token.name,
          token.symbol,
          token.metadataUri,
          role,
          token.actorIsAuthority ? token.authorityWallet : null,
          token.actorIsAuthority ? token.authorityKind : null,
          token.actorIsAuthority ? timestamp : null,
          timestamp,
          timestamp,
        ),
        env.CREATORS_DB.prepare(
          "INSERT INTO community_members(mint,wallet,joined_at) VALUES(?,?,?)",
        ).bind(mint, user.wallet, timestamp),
      ]);
    } catch (error) {
      if (/UNIQUE constraint failed: communities.mint/.test(String(error)))
        throw new ApiError(
          409,
          "This token already has a Nikki community. Open it from Communities.",
        );
      quotaError(error);
    }
    return json(
      { community: community(await findCommunity(env, mint)), joined: true },
      201,
    );
  }
  const parts = route.split("/").filter(Boolean);
  if (parts.length < 2)
    throw new ApiError(405, "This community action isn't supported.");
  const mint = wallet(parts[1]),
    row = await findCommunity(env, mint),
    moderator = canModerate(env, user, row);
  if (parts.length === 2 && req.method === "GET") {
    const joined = user
      ? !!(await env.CREATORS_DB.prepare(
          "SELECT 1 FROM community_members WHERE mint=? AND wallet=?",
        )
          .bind(mint, user.wallet)
          .first())
      : false;
    return json({
      community: community(row),
      joined,
      user: user ? { wallet: user.wallet, xUsername: user.x_username } : null,
      permissions: {
        canPost: !!user?.x_id,
        canEdit: user?.wallet === row.owner_wallet,
        canModerate: moderator,
        canJoin: !!user,
      },
    });
  }
  if (parts.length === 3 && parts[2] === "profile" && req.method === "POST") {
    paired(user);
    if (user.wallet !== row.owner_wallet)
      throw new ApiError(
        403,
        "Only this community's organizer can edit its profile.",
      );
    await limit(env, "community-profile", user.wallet, 10);
    const data = await body(req);
    if (data.mint !== undefined && data.mint !== mint)
      throw new ApiError(400, "A community's token address cannot change.");
    const draft = profile(data);
    await env.CREATORS_DB.prepare(
      "UPDATE communities SET name=?,description=?,logo_url=?,website_url=?,x_url=?,telegram_url=?,accent=?,updated_at=? WHERE mint=? AND owner_wallet=?",
    )
      .bind(
        draft.name,
        draft.description,
        draft.logoUrl,
        draft.websiteUrl,
        draft.xUrl,
        draft.telegramUrl,
        draft.accent,
        now(),
        mint,
        user.wallet,
      )
      .run();
    return json({ community: community(await findCommunity(env, mint)) });
  }
  if (
    parts.length === 3 &&
    parts[2] === "membership" &&
    req.method === "POST"
  ) {
    const data = await body(req);
    if (typeof data.joined !== "boolean")
      throw new ApiError(400, "Choose join or leave.");
    await limit(env, "community-membership", user!.wallet, 20);
    try {
      if (data.joined)
        await env.CREATORS_DB.prepare(
          "INSERT INTO community_members(mint,wallet,joined_at) VALUES(?,?,?) ON CONFLICT(mint,wallet) DO NOTHING",
        )
          .bind(mint, user!.wallet, now())
          .run();
      else
        await env.CREATORS_DB.prepare(
          "DELETE FROM community_members WHERE mint=? AND wallet=?",
        )
          .bind(mint, user!.wallet)
          .run();
    } catch (error) {
      quotaError(error);
    }
    const count = await env.CREATORS_DB.prepare(
      "SELECT count(*) AS n FROM community_members WHERE mint=?",
    )
      .bind(mint)
      .first<{ n: number }>();
    return json({ joined: data.joined, memberCount: count?.n || 0 });
  }
  if (parts.length === 3 && parts[2] === "posts" && req.method === "GET") {
    const before = url.searchParams.get("before"),
      cursor = before
        ? positiveId(before, "Post cursor")
        : Number.MAX_SAFE_INTEGER;
    const posts = await env.CREATORS_DB.prepare(
      postSelect +
        " WHERE p.mint=? AND p.state='visible' AND p.id<? ORDER BY p.id DESC LIMIT 26",
    )
      .bind(mint, cursor)
      .all<PostRow>();
    const rows = posts.results.slice(0, 25);
    return json({
      posts: rows.map((p) => post(p, user, moderator)),
      nextCursor:
        posts.results.length > 25 ? String(rows[rows.length - 1].id) : null,
    });
  }
  if (parts.length === 3 && parts[2] === "posts" && req.method === "POST") {
    paired(user);
    const data = await body(req),
      content = text(data.text, 1, 2000, "Post"),
      clientId = text(data.clientId, 16, 80, "Post identifier");
    if (!/^[A-Za-z0-9_-]+$/.test(clientId))
      throw new ApiError(400, "The post identifier is invalid.");
    const previous = await env.CREATORS_DB.prepare(
      postSelect + " WHERE p.wallet=? AND p.client_id=?",
    )
      .bind(user.wallet, clientId)
      .first<PostRow>();
    if (previous) {
      if (previous.state !== "visible")
        throw new ApiError(409, "This post was already removed.");
      if (previous.mint !== mint || previous.text !== content)
        throw new ApiError(
          409,
          "This post identifier was already used. Refresh and try again.",
        );
      return json({ post: post(previous, user, moderator) });
    }
    await limit(env, "community-post-minute", user.wallet, 5);
    await limit(env, "community-post-day", user.wallet, 50, 86400);
    await limit(env, "community-post-x-minute", user.x_id!, 5);
    await limit(env, "community-post-x-day", user.x_id!, 50, 86400);
    try {
      await env.CREATORS_DB.prepare(
        "INSERT INTO community_posts(mint,wallet,client_id,text,created_at) VALUES(?,?,?,?,?) ON CONFLICT(wallet,client_id) DO NOTHING",
      )
        .bind(mint, user.wallet, clientId, content, now())
        .run();
    } catch (error) {
      quotaError(error);
    }
    const saved = await env.CREATORS_DB.prepare(
      postSelect + " WHERE p.wallet=? AND p.client_id=?",
    )
      .bind(user.wallet, clientId)
      .first<PostRow>();
    if (
      !saved ||
      saved.mint !== mint ||
      saved.text !== content ||
      saved.state !== "visible"
    )
      throw new ApiError(409, "This post changed. Refresh and try again.");
    return json({ post: post(saved, user, moderator) }, 201);
  }
  if (
    parts.length === 5 &&
    parts[2] === "posts" &&
    parts[4] === "delete" &&
    req.method === "POST"
  ) {
    const id = positiveId(parts[3], "Post"),
      address = user!.wallet;
    await body(req);
    await limit(env, "community-delete", address, 20);
    const target = await env.CREATORS_DB.prepare(
      "SELECT wallet,state FROM community_posts WHERE id=? AND mint=?",
    )
      .bind(id, mint)
      .first<{ wallet: string; state: string }>();
    if (!target) throw new ApiError(404, "This post could not be found.");
    const own = target.wallet === address;
    if (!own && !moderator)
      throw new ApiError(403, "You can only remove your own posts.");
    if (target.state !== "visible" && !(own && target.state === "hidden"))
      return json({ ok: true });
    await env.CREATORS_DB.batch([
      env.CREATORS_DB.prepare(
        "UPDATE community_posts SET state=?,text=CASE WHEN ? THEN '' ELSE text END,moderated_at=?,moderated_by=? WHERE id=? AND mint=? AND (state='visible' OR (?=1 AND state='hidden'))",
      ).bind(
        own ? "deleted" : "hidden",
        own ? 1 : 0,
        now(),
        address,
        id,
        mint,
        own ? 1 : 0,
      ),
      env.CREATORS_DB.prepare(
        "INSERT INTO creator_ops_audit(id,actor,action,target,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1",
      ).bind(
        random(),
        address,
        own ? "community-post-delete" : "community-post-hide",
        String(id),
        mint,
        now(),
      ),
    ]);
    return json({ ok: true });
  }
  throw new ApiError(404, "This community action could not be found.");
}
