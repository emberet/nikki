import type { StorageRate } from "./storage-estimate";

// The unauthenticated Turbo SDK uses these versioned payment-service routes.
// https://docs.ar.io/build/upload/turbo-credits#http-api
const UPLOAD_RATE_URL = "https://payment.ardrive.io/v1/price/bytes/1073741824";
const SOL_RATE_URL = "https://payment.ardrive.io/v1/price/solana/1000000000";
const CACHE_MS = 15 * 60 * 1_000;
const FAILURE_COOLDOWN_MS = 30_000;
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 4_096;

let cached: StorageRate | undefined;
let pending: Promise<StorageRate> | undefined;
let retryAfter = 0;

async function fetchWinc(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    // Workers support manual redirects; the status check below rejects 3xx.
    redirect: "manual",
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error("Storage rate is unavailable.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let data = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Storage rate is unavailable.");
      }
      data += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  data += decoder.decode();
  const result: unknown = JSON.parse(data);
  if (
    !result ||
    typeof result !== "object" ||
    !("winc" in result) ||
    typeof result.winc !== "string" ||
    !/^[1-9]\d{0,39}$/.test(result.winc)
  ) {
    throw new Error("Storage rate is unavailable.");
  }
  return result.winc;
}

/** Shared per-runtime cache; no wallet, balance, purchase, or upload is involved. */
export async function getStorageRate(): Promise<StorageRate> {
  const now = Date.now();
  if (cached && Date.parse(cached.expiresAt) > now) return cached;
  if (pending) return pending;
  if (now < retryAfter) throw new Error("Storage rate is unavailable.");

  pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const [wincPerGiB, wincPerSol] = await Promise.all([
        fetchWinc(UPLOAD_RATE_URL, controller.signal),
        fetchWinc(SOL_RATE_URL, controller.signal),
      ]);
      const updated = Date.now();
      cached = Object.freeze({
        wincPerGiB,
        wincPerSol,
        updatedAt: new Date(updated).toISOString(),
        expiresAt: new Date(updated + CACHE_MS).toISOString(),
      });
      retryAfter = 0;
      return cached;
    } catch {
      cached = undefined;
      retryAfter = Date.now() + FAILURE_COOLDOWN_MS;
      throw new Error("Storage rate is unavailable.");
    } finally {
      clearTimeout(timeout);
      controller.abort();
      pending = undefined;
    }
  })();
  return pending;
}
