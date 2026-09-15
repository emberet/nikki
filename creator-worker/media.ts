import { edgeCache } from "./cache";
import { session } from "./auth";
import { ApiError, body, json, limit, now, random } from "./common";
import type { Env } from "./types";

export function jpegDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 12 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new ApiError(415, "Choose a JPEG, PNG, or WebP image.");
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 255) break;
    const marker = bytes[i + 1];
    if (marker === 218 || marker === 217) break;
    const length = bytes[i + 2] * 256 + bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) break;
    if ([192, 193, 194].includes(marker)) {
      if (length < 8) break;
      const height = bytes[i + 5] * 256 + bytes[i + 6],
        width = bytes[i + 7] * 256 + bytes[i + 8];
      if (!width || !height || width > 1600 || height > 1600) break;
      return { width, height };
    }
    i += 2 + length;
  }
  throw new ApiError(
    415,
    "This image could not be read. Choose another image.",
  );
}
async function readImage(req: Request, max: number) {
  if (req.headers.get("content-type") !== "image/jpeg")
    throw new ApiError(415, "Use the channel image picker to upload a photo.");
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new ApiError(413, "The image is too large. Choose a smaller image.");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Choose an image first.");
  const chunks: Uint8Array[] = [];
  let size = 0,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, 15000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new ApiError(408, "The upload timed out. Try again.");
      if (part.done) break;
      size += part.value.length;
      if (size > max) {
        await reader.cancel();
        throw new ApiError(413, "The image is too large.");
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}
export async function cleanupMedia(env: Env, owner?: string) {
  if (!env.CREATOR_MEDIA) return;
  const rows = await env.CREATORS_DB.prepare(
    "SELECT id,object_key FROM creator_assets a WHERE (ready=1 OR created_at<?) AND (? IS NULL OR wallet=?) AND NOT EXISTS(SELECT 1 FROM creator_profiles p WHERE p.avatar_id=a.id OR p.banner_id=a.id) LIMIT 12",
  )
    .bind(now() - 3600, owner || null, owner || null)
    .all<{ id: string; object_key: string }>();
  for (const row of rows.results) {
    await env.CREATOR_MEDIA.delete(row.object_key);
    await env.CREATORS_DB.prepare("DELETE FROM creator_assets WHERE id=?")
      .bind(row.id)
      .run();
  }
}
export async function mediaApi(
  req: Request,
  env: Env,
  route: string,
): Promise<Response | null> {
  const match = route.match(/^\/media\/([a-f0-9]{64})$/);
  if (match && req.method === "GET") {
    if (!env.CREATOR_MEDIA) throw new ApiError(404, "Image not found.");
    const asset = await env.CREATORS_DB.prepare(
      "SELECT a.wallet,a.object_key,p.published,u.x_id FROM creator_assets a JOIN creator_profiles p ON p.wallet=a.wallet JOIN creator_users u ON u.wallet=a.wallet WHERE a.id=? AND (p.avatar_id=a.id OR p.banner_id=a.id)",
    )
      .bind(match[1])
      .first<{
        wallet: string;
        object_key: string;
        published: number;
        x_id: string | null;
      }>();
    if (!asset) throw new ApiError(404, "Image not found.");
    const isPublic = !!asset.published && !!asset.x_id;
    if (
      !isPublic &&
      (await session(req, env, false)).user?.wallet !== asset.wallet
    )
      throw new ApiError(404, "Image not found.");
    const cache = isPublic ? edgeCache() : undefined;
    const cacheKey = new Request(
      new URL(req.url).origin + "/api/creators/media/" + match[1],
    );
    const cached = await cache?.match(cacheKey);
    if (cached) return cached;
    const object = await env.CREATOR_MEDIA.get(asset.object_key);
    if (!object) throw new ApiError(404, "Image not found.");
    const response = new Response(object.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": isPublic ? "public,max-age=60" : "no-store",
        ETag: object.httpEtag,
      },
    });
    if (cache) await cache.put(cacheKey, response.clone()).catch(() => {});
    return response;
  }
  if (!route.startsWith("/profile/media/")) return null;
  const current = await session(req, env),
    address = current.user!.wallet;
  if (req.method !== "POST")
    throw new ApiError(405, "Use the channel editor to change artwork.");
  await limit(env, "artwork", address, 12, 3600);
  const kind = route.split("/")[3];
  if (!["avatar", "banner"].includes(kind))
    throw new ApiError(404, "Choose an avatar or cover image.");
  const column = kind === "avatar" ? "avatar_id" : "banner_id";
  if (
    !(await env.CREATORS_DB.prepare(
      "SELECT wallet FROM creator_profiles WHERE wallet=?",
    )
      .bind(address)
      .first())
  )
    throw new ApiError(409, "Save your channel before adding images.");
  if (req.headers.get("content-type")?.includes("application/json")) {
    const data = await body(req);
    if (data.remove !== true)
      throw new ApiError(400, "Choose an image or remove it.");
    await env.CREATORS_DB.prepare(
      `UPDATE creator_profiles SET ${column}=NULL,updated_at=? WHERE wallet=?`,
    )
      .bind(now(), address)
      .run();
    await cleanupMedia(env, address);
    return json({ removed: true });
  }
  if (!current.user!.x_id)
    throw new ApiError(
      409,
      "Verify your X account before uploading channel artwork.",
    );
  await limit(env, "artwork-x", current.user!.x_id, 12, 3600);
  await limit(
    env,
    "artwork-ip",
    req.headers.get("cf-connecting-ip") || "local",
    24,
    3600,
  );
  await cleanupMedia(env, address);
  if (!env.CREATOR_MEDIA)
    throw new ApiError(
      503,
      "Image uploads are being connected. Your channel can still be published.",
    );
  const bytes = await readImage(req, kind === "avatar" ? 131072 : 393216),
    size = jpegDimensions(bytes);
  if (kind === "avatar" && (size.width > 512 || size.height > 512))
    throw new ApiError(413, "Avatar dimensions are too large.");
  const id = random(),
    key = "profiles/" + id + ".jpg";
  try {
    await env.CREATORS_DB.prepare(
      "INSERT INTO creator_assets(id,wallet,kind,object_key,bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        address,
        kind,
        key,
        bytes.length,
        size.width,
        size.height,
        now(),
      )
      .run();
  } catch (error) {
    if (String(error).includes("ART_OWNER_FULL"))
      throw new ApiError(
        429,
        "Your previous image uploads are still processing. Please try again shortly.",
      );
    if (String(error).includes("ART_STORAGE_FULL"))
      throw new ApiError(503, "Image storage is full. Please try again later.");
    throw error;
  }
  try {
    await env.CREATOR_MEDIA.put(key, bytes, {
      httpMetadata: { contentType: "image/jpeg" },
    });
    await env.CREATORS_DB.batch([
      env.CREATORS_DB.prepare(
        `UPDATE creator_profiles SET ${column}=?,updated_at=? WHERE wallet=?`,
      ).bind(id, now(), address),
      env.CREATORS_DB.prepare(
        "UPDATE creator_assets SET ready=1 WHERE id=?",
      ).bind(id),
    ]);
  } catch (error) {
    await env.CREATOR_MEDIA.delete(key).catch(() => {});
    await env.CREATORS_DB.prepare("DELETE FROM creator_assets WHERE id=?")
      .bind(id)
      .run();
    throw error;
  }
  await cleanupMedia(env, address).catch(() => {});
  return json({ id, url: "/api/creators/media/" + id });
}
