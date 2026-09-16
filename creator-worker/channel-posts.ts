import { session } from "./auth";
import { ApiError, body, json, limit, now, random } from "./common";
import {
  contentQuotaError,
  ownedAsset,
  postContent,
  requirePaired,
  serializeContentPost,
  type ContentPostRow,
} from "./content-media";
import type { Env } from "./types";
interface ChannelPost extends ContentPostRow {
  channel_wallet: string;
}
const select = `SELECT p.*,u.x_username,cp.display_name,cp.handle,cp.avatar_id,a.width AS image_width,a.height AS image_height
  FROM channel_posts p JOIN creator_users u ON u.wallet=p.wallet
  LEFT JOIN creator_profiles cp ON cp.wallet=p.wallet AND cp.published=1
  LEFT JOIN content_assets a ON a.id=p.image_id AND a.ready=1`;
function positiveId(value: string) {
  if (!/^[1-9]\d{0,14}$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new ApiError(400, "Choose a valid post or page.");
  return Number(value);
}
export async function channelPostsApi(
  req: Request,
  env: Env,
  route: string,
): Promise<Response | null> {
  const match = route.match(
    /^\/channels\/([a-z0-9_]{3,24})\/posts(?:\/([1-9]\d{0,14})\/delete)?$/,
  );
  if (!match) return null;
  const { user } = await session(req, env, req.method !== "GET"),
    channel = await env.CREATORS_DB.prepare(
      "SELECT p.wallet,p.handle,p.published,u.x_id FROM creator_profiles p JOIN creator_users u ON u.wallet=p.wallet WHERE p.handle=? AND p.published=1 AND u.x_id IS NOT NULL",
    )
      .bind(match[1])
      .first<{
        wallet: string;
        handle: string;
        published: number;
        x_id: string;
      }>();
  if (!channel) throw new ApiError(404, "This channel could not be found.");
  const canPost = !!user?.x_id && user.wallet === channel.wallet,
    moderator = !!user && user.wallet === env.FOUNDER_WALLET;
  if (!match[2] && req.method === "GET") {
    const before = new URL(req.url).searchParams.get("before"),
      cursor = before ? positiveId(before) : Number.MAX_SAFE_INTEGER,
      results = await env.CREATORS_DB.prepare(
        select +
          " WHERE p.channel_wallet=? AND p.state='visible' AND p.id<? ORDER BY p.id DESC LIMIT 26",
      )
        .bind(channel.wallet, cursor)
        .all<ChannelPost>(),
      rows = results.results.slice(0, 25);
    return json({
      posts: rows.map((row) => serializeContentPost(row, user, moderator)),
      nextCursor: results.results.length > 25 ? String(rows.at(-1)!.id) : null,
      permissions: { canPost, canModerate: moderator },
    });
  }
  if (!match[2] && req.method === "POST") {
    requirePaired(user);
    if (!canPost)
      throw new ApiError(
        403,
        "Only this channel's creator can publish its posts.",
      );
    const { content, imageId, imageAlt, clientId } = postContent(
        await body(req),
      ),
      previous = await env.CREATORS_DB.prepare(
        select + " WHERE p.wallet=? AND p.client_id=?",
      )
        .bind(user.wallet, clientId)
        .first<ChannelPost>();
    function matches(row: ChannelPost) {
      return (
        row.channel_wallet === channel!.wallet &&
        row.text === content &&
        row.image_id === imageId &&
        row.image_alt === imageAlt &&
        row.state === "visible"
      );
    }
    if (previous) {
      if (!matches(previous))
        throw new ApiError(
          409,
          "This post identifier was already used or removed. Refresh and try again.",
        );
      return json({ post: serializeContentPost(previous, user, moderator) });
    }
    await ownedAsset(env, imageId, user.wallet, "post-image");
    await limit(env, "channel-post-minute", user.wallet, 5);
    await limit(env, "channel-post-day", user.wallet, 50, 86400);
    await limit(env, "channel-post-x-minute", user.x_id!, 5);
    await limit(env, "channel-post-x-day", user.x_id!, 50, 86400);
    try {
      // Published/X status is checked again in the insert, so an in-flight unpublish wins.
      await env.CREATORS_DB.prepare(
        "INSERT INTO channel_posts(channel_wallet,wallet,client_id,text,image_id,image_alt,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM creator_profiles p JOIN creator_users u ON u.wallet=p.wallet WHERE p.wallet=? AND p.published=1 AND u.x_id IS NOT NULL) ON CONFLICT(wallet,client_id) DO NOTHING",
      )
        .bind(
          channel.wallet,
          user.wallet,
          clientId,
          content,
          imageId,
          imageAlt,
          now(),
          channel.wallet,
        )
        .run();
    } catch (error) {
      contentQuotaError(error);
    }
    const saved = await env.CREATORS_DB.prepare(
      select + " WHERE p.wallet=? AND p.client_id=?",
    )
      .bind(user.wallet, clientId)
      .first<ChannelPost>();
    if (!saved || !matches(saved))
      throw new ApiError(
        409,
        "This post or channel changed. Refresh and try again.",
      );
    return json({ post: serializeContentPost(saved, user, moderator) }, 201);
  }
  if (match[2] && req.method === "POST") {
    await body(req);
    const id = positiveId(match[2]),
      address = user!.wallet,
      target = await env.CREATORS_DB.prepare(
        "SELECT wallet,state FROM channel_posts WHERE id=? AND channel_wallet=?",
      )
        .bind(id, channel.wallet)
        .first<{ wallet: string; state: string }>();
    if (!target) throw new ApiError(404, "This post could not be found.");
    const own = target.wallet === address;
    if (!own && !moderator)
      throw new ApiError(403, "You can only remove your own posts.");
    if (target.state !== "visible" && !(own && target.state === "hidden"))
      return json({ ok: true });
    await limit(env, "channel-post-delete", address, 20);
    await env.CREATORS_DB.batch([
      env.CREATORS_DB.prepare(
        "UPDATE channel_posts SET state=?,text=CASE WHEN ? THEN '' ELSE text END,image_id=CASE WHEN ? THEN NULL ELSE image_id END,image_alt=CASE WHEN ? THEN '' ELSE image_alt END,moderated_at=?,moderated_by=? WHERE id=? AND channel_wallet=? AND (state='visible' OR (?=1 AND state='hidden'))",
      ).bind(
        own ? "deleted" : "hidden",
        own ? 1 : 0,
        own ? 1 : 0,
        own ? 1 : 0,
        now(),
        address,
        id,
        channel.wallet,
        own ? 1 : 0,
      ),
      env.CREATORS_DB.prepare(
        "INSERT INTO creator_ops_audit(id,actor,action,target,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1",
      ).bind(
        random(),
        address,
        own ? "channel-post-delete" : "channel-post-hide",
        String(id),
        channel.handle,
        now(),
      ),
    ]);
    return json({ ok: true });
  }
  throw new ApiError(405, "This channel post action is not supported.");
}
