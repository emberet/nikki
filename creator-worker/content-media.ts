import { session } from "./auth";
import { ApiError, json, limit, now, random, text } from "./common";
import { jpegDimensions } from "./media";
import type { CreatorUser, Env } from "./types";

export type ContentMediaKind =
  "community-logo" | "community-banner" | "post-image";
export const contentMediaUrl = (id: string) =>
  "/api/creators/content/media/" + id;
export function requirePaired(
  user: CreatorUser | null,
): asserts user is CreatorUser {
  if (!user) throw new ApiError(401, "Connect and sign in with your wallet.");
  if (!user.x_id)
    throw new ApiError(403, "Pair your wallet with X in Creator Studio first.");
}
export function assetId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw new ApiError(400, "Choose an image using the image picker.");
  return value;
}
export async function ownedAsset(
  env: Env,
  id: string | null,
  owner: string,
  kind: ContentMediaKind,
) {
  if (!id) return;
  const row = await env.CREATORS_DB.prepare(
    "SELECT id FROM content_assets WHERE id=? AND wallet=? AND kind=? AND ready=1",
  )
    .bind(id, owner, kind)
    .first();
  if (!row)
    throw new ApiError(
      400,
      "This image is unavailable. Upload it again from your device.",
    );
}
export function postContent(data: Record<string, unknown>) {
  const content = text(data.text ?? "", 0, 2000, "Post"),
    imageId = assetId(data.imageId),
    imageAlt = text(data.imageAlt ?? "", 0, 240, "Image description"),
    clientId = text(data.clientId, 16, 80, "Post identifier");
  if (!content && !imageId)
    throw new ApiError(400, "Write a post or add an image first.");
  if (!/^[A-Za-z0-9_-]+$/.test(clientId))
    throw new ApiError(400, "The post identifier is invalid.");
  if (imageAlt && !imageId)
    throw new ApiError(400, "Add an image before its description.");
  return { content, imageId, imageAlt, clientId };
}
export interface ContentPostRow {
  id: number;
  wallet: string;
  client_id: string;
  text: string;
  state: string;
  created_at: number;
  display_name: string | null;
  handle: string | null;
  avatar_id: string | null;
  x_username: string | null;
  image_id: string | null;
  image_alt: string;
  image_width: number | null;
  image_height: number | null;
}
export function serializeContentPost(
  row: ContentPostRow,
  user: CreatorUser | null,
  moderator: boolean,
) {
  return {
    id: String(row.id),
    text: row.text,
    createdAt: row.created_at,
    image: row.image_id
      ? {
          id: row.image_id,
          url: contentMediaUrl(row.image_id),
          width: row.image_width,
          height: row.image_height,
          alt: row.image_alt || "",
        }
      : null,
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
export function contentQuotaError(error: unknown): never {
  const message = String(error);
  if (/CONTENT_ASSET_INVALID/.test(message))
    throw new ApiError(409, "This image changed. Upload it again and retry.");
  if (/CONTENT_OWNER_FULL/.test(message))
    throw new ApiError(
      409,
      "Your free image space is full. Remove older image posts or try again after unused uploads expire.",
    );
  if (/CONTENT_STORAGE_FULL|CHANNEL_POSTS_FULL/.test(message))
    throw new ApiError(
      503,
      "Free posting has reached its early-release capacity. Please try again later.",
    );
  if (/CHANNEL_POSTS_OWNER_FULL/.test(message))
    throw new ApiError(
      409,
      "You've reached the early-release post allowance. Contact Nikki for help.",
    );
  throw error;
}
// All references (including moderated records) protect objects against cleanup.
// Marking first prevents an attachment from racing an R2 delete; SQL triggers reject ready=2.
const unreferenced = `NOT EXISTS(SELECT 1 FROM communities c WHERE c.logo_asset_id=content_assets.id OR c.banner_asset_id=content_assets.id)
  AND NOT EXISTS(SELECT 1 FROM community_posts p WHERE p.image_id=content_assets.id)
  AND NOT EXISTS(SELECT 1 FROM channel_posts p WHERE p.image_id=content_assets.id)`;
export async function cleanupContentMedia(env: Env, owner?: string) {
  if (!env.CREATOR_MEDIA) return;
  const candidates = await env.CREATORS_DB.prepare(
    `SELECT id FROM content_assets WHERE (ready=2 OR created_at<?) AND (? IS NULL OR wallet=?) AND ${unreferenced} LIMIT 16`,
  )
    .bind(now() - 86400, owner || null, owner || null)
    .all<{ id: string }>();
  for (const candidate of candidates.results) {
    const row = await env.CREATORS_DB.prepare(
      `UPDATE content_assets SET ready=2 WHERE id=? AND (ready=2 OR created_at<?) AND ${unreferenced} RETURNING id,object_key`,
    )
      .bind(candidate.id, now() - 86400)
      .first<{ id: string; object_key: string }>();
    if (!row) continue;
    await env.CREATOR_MEDIA.delete(row.object_key);
    await env.CREATORS_DB.prepare(
      "DELETE FROM content_assets WHERE id=? AND ready=2",
    )
      .bind(row.id)
      .run();
  }
}
async function readImage(req: Request) {
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "image/jpeg")
    throw new ApiError(415, "Use the image picker to upload a photo.");
  if (Number(req.headers.get("content-length") || 0) > 524288)
    throw new ApiError(
      413,
      "Choose an image smaller than 512 KB after compression.",
    );
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Choose an image first.");
  let size = 0,
    timedOut = false;
  const chunks: Uint8Array[] = [],
    timer = setTimeout(() => {
      timedOut = true;
      void reader.cancel();
    }, 15000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new ApiError(408, "The upload timed out. Try again.");
      if (part.done) break;
      size += part.value.length;
      if (size > 524288) {
        await reader.cancel();
        throw new ApiError(413, "This image is too large.");
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}
export async function contentMediaApi(
  req: Request,
  env: Env,
  route: string,
): Promise<Response | null> {
  if (!/^\/content\/media(?:\/|$)/.test(route)) return null;
  const match = route.match(/^\/content\/media\/([a-f0-9]{64})$/);
  if (match && req.method === "GET") {
    if (!env.CREATOR_MEDIA) throw new ApiError(404, "Image not found.");
    const row = await env.CREATORS_DB.prepare(
      `SELECT a.wallet,a.object_key,
      (EXISTS(SELECT 1 FROM communities c WHERE c.logo_asset_id=a.id OR c.banner_asset_id=a.id)
       OR EXISTS(SELECT 1 FROM community_posts p WHERE p.image_id=a.id AND p.state='visible')
       OR EXISTS(SELECT 1 FROM channel_posts p JOIN creator_profiles cp ON cp.wallet=p.channel_wallet JOIN creator_users u ON u.wallet=cp.wallet WHERE p.image_id=a.id AND p.state='visible' AND cp.published=1 AND u.x_id IS NOT NULL)) AS is_public,
      (EXISTS(SELECT 1 FROM communities c WHERE c.logo_asset_id=a.id OR c.banner_asset_id=a.id)
       OR EXISTS(SELECT 1 FROM community_posts p WHERE p.image_id=a.id)
       OR EXISTS(SELECT 1 FROM channel_posts p WHERE p.image_id=a.id)) AS has_refs
      FROM content_assets a WHERE a.id=? AND a.ready=1`,
    )
      .bind(match[1])
      .first<{
        wallet: string;
        object_key: string;
        is_public: number;
        has_refs: number;
      }>();
    if (
      !row ||
      (!row.is_public &&
        (row.has_refs ||
          (await session(req, env, false)).user?.wallet !== row.wallet))
    )
      throw new ApiError(404, "Image not found.");
    const object = await env.CREATOR_MEDIA.get(row.object_key);
    if (!object) throw new ApiError(404, "Image not found.");
    return new Response(object.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        ETag: object.httpEtag,
      },
    });
  }
  if (route !== "/content/media" || req.method !== "POST")
    throw new ApiError(404, "This image action could not be found.");
  const { user } = await session(req, env);
  requirePaired(user);
  const kind = new URL(req.url).searchParams.get("kind") as ContentMediaKind;
  if (!["community-logo", "community-banner", "post-image"].includes(kind))
    throw new ApiError(400, "Choose a logo, banner, or post image.");
  if (!env.CREATOR_MEDIA)
    throw new ApiError(
      503,
      "Image uploads are being connected. Please try again shortly.",
    );
  await limit(env, "content-image-wallet", user.wallet, 20, 3600);
  await limit(env, "content-image-x", user.x_id!, 20, 3600);
  await limit(
    env,
    "content-image-ip",
    req.headers.get("cf-connecting-ip") || "local",
    40,
    3600,
  );
  const bytes = await readImage(req),
    size = jpegDimensions(bytes);
  if (kind === "community-logo" && (size.width > 512 || size.height > 512))
    throw new ApiError(
      413,
      "Logo dimensions must fit within 512 × 512 pixels.",
    );
  await cleanupContentMedia(env, user.wallet);
  const id = random(),
    key = "content/" + id + ".jpg";
  try {
    await env.CREATORS_DB.prepare(
      "INSERT INTO content_assets(id,wallet,kind,object_key,bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        user.wallet,
        kind,
        key,
        bytes.length,
        size.width,
        size.height,
        now(),
      )
      .run();
  } catch (error) {
    contentQuotaError(error);
  }
  try {
    await env.CREATOR_MEDIA.put(key, bytes, {
      httpMetadata: { contentType: "image/jpeg" },
    });
    await env.CREATORS_DB.prepare(
      "UPDATE content_assets SET ready=1 WHERE id=? AND ready=0",
    )
      .bind(id)
      .run();
  } catch (error) {
    // Keep a reservation if R2 cleanup fails so storage stays accounted for and cleanup can retry.
    await env.CREATORS_DB.prepare(
      "UPDATE content_assets SET ready=2 WHERE id=? AND ready=0",
    )
      .bind(id)
      .run()
      .catch(() => {});
    try {
      await env.CREATOR_MEDIA.delete(key);
      await env.CREATORS_DB.prepare(
        "DELETE FROM content_assets WHERE id=? AND ready=2",
      )
        .bind(id)
        .run();
    } catch {}
    throw error;
  }
  return json({ id, url: contentMediaUrl(id), ...size }, 201);
}
