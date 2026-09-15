import { createHash } from "crypto";
import { db } from "./db";
import { HttpError } from "./http";
export async function rateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMs = 60000,
) {
  const now = Date.now(),
    window = Math.floor(now / windowMs),
    expiresAt = new Date((window + 1) * windowMs);
  const id = createHash("sha256")
    .update(scope + ":" + subject + ":" + window)
    .digest("hex");
  const bucket = await db.rateBucket.upsert({
    where: { id },
    create: { id, expiresAt, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (bucket.count > limit)
    throw new HttpError(429, "Too many attempts. Please try again shortly.", {
      "Retry-After": String(
        Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
      ),
    });
}
