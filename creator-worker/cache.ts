import { holdings } from "./chain";
import type { Env } from "./types";
import { ApiError, now } from "./common";
// Cache API data stays internal. Authenticated callers still receive no-store responses.
export function edgeCache(): Cache | undefined {
  return (
    globalThis as typeof globalThis & {
      caches?: CacheStorage & { default?: Cache };
    }
  ).caches?.default;
}
export async function cachedHoldings(env: Env, address: string, mint?: string) {
  const key = new Request(
    "https://nikki.run/_internal/holdings/v1/mainnet/" +
      address +
      "/" +
      (mint || "all"),
  );
  const cache = edgeCache(),
    hit = await cache?.match(key);
  if (hit) {
    const data = (await hit.json()) as {
      entries: [string, string][];
      checkedAt: number;
    };
    return {
      balances: new Map(
        data.entries.map(([key, value]) => [key, BigInt(value)]),
      ),
      checkedAt: data.checkedAt,
    };
  }
  const balances = await holdings(env, address, mint),
    checkedAt = now();
  await cache
    ?.put(
      key,
      Response.json(
        {
          entries: [...balances].map(([key, value]) => [key, value.toString()]),
          checkedAt,
        },
        { headers: { "Cache-Control": "public,max-age=20" } },
      ),
    )
    .catch(() => {});
  return { balances, checkedAt };
}

// An inexpensive first barrier on each Worker instance; D1 remains authoritative for mutations.
const readers = new Map<string, { count: number; until: number }>();
export function limitRead(ip: string) {
  const time = now();
  if (readers.size > 4096)
    for (const [key, bucket] of readers)
      if (bucket.until < time) readers.delete(key);
  const key = readers.has(ip) || readers.size < 4096 ? ip : "overflow";
  let bucket = readers.get(key);
  if (!bucket || bucket.until < time) {
    bucket = { count: 0, until: time + 60 };
    readers.set(key, bucket);
  }
  if (++bucket.count > 90)
    throw new ApiError(429, "Too many requests. Please try again shortly.");
}
export function publicCacheKey(url: URL) {
  const key = new URL(url.origin + url.pathname.replace(/\/$/, ""));
  if (key.pathname === "/api/creators/channels") {
    key.searchParams.set(
      "q",
      (url.searchParams.get("q") || "").slice(0, 100).trim(),
    );
    key.searchParams.set(
      "category",
      ["History", "Knowledge", "Culture"].includes(
        url.searchParams.get("category") || "",
      )
        ? url.searchParams.get("category")!
        : "",
    );
    key.searchParams.set(
      "offset",
      String(Number(url.searchParams.get("offset") || 0)),
    );
  }
  return new Request(key);
}
