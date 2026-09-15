import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateStorageLamports,
  formatStorageSol,
  type StorageRate,
} from "../lib/storage-estimate";
import { getStorageRate } from "../lib/storage-rate";
import { storagePricing } from "../creator-worker/storage-pricing";

const fixtureRate: StorageRate = {
  wincPerGiB: "1073741824",
  wincPerSol: "1000000000",
  updatedAt: "2026-09-16T00:00:00.000Z",
  expiresAt: "2026-09-16T00:15:00.000Z",
};

test("storage estimates include overhead and preserve exact integer precision", () => {
  assert.equal(estimateStorageLamports(fixtureRate, 1), 16_385n);
  assert.equal(
    estimateStorageLamports(fixtureRate, 1_000_000_000),
    1_000_016_384n,
  );
  assert.equal(
    estimateStorageLamports({ ...fixtureRate, wincPerSol: "3000000000" }, 1),
    5_462n,
  );
  const large = { ...fixtureRate, wincPerGiB: "99999999999999999999999" };
  const expected =
    (16_385n * 99_999_999_999_999_999_999_999n + 1_073_741_823n) /
    1_073_741_824n;
  assert.equal(estimateStorageLamports(large, 1), expected);
});

test("storage estimates reject unsupported sizes and malformed monetary rates", () => {
  for (const bytes of [0, -1, 0.5, NaN, Infinity, 1_000_000_001]) {
    assert.throws(() => estimateStorageLamports(fixtureRate, bytes));
  }
  for (const winc of ["0", "-1", "1.5", "1e4", " 1", "", "1".repeat(41)]) {
    assert.throws(() =>
      estimateStorageLamports({ ...fixtureRate, wincPerGiB: winc }, 1),
    );
    assert.throws(() =>
      estimateStorageLamports({ ...fixtureRate, wincPerSol: winc }, 1),
    );
  }
});

test("SOL display rounds without losing precision or hiding a tiny positive fee", () => {
  assert.equal(formatStorageSol(0n), "0.0000");
  assert.equal(formatStorageSol(1n), "<0.000001");
  assert.equal(formatStorageSol(50_900_000n), "0.0509");
  assert.equal(formatStorageSol(50_911_499n), "0.050911");
  assert.equal(formatStorageSol(50_911_500n), "0.050912");
  assert.equal(formatStorageSol(999_999_500n), "1.0000");
  assert.equal(
    formatStorageSol(9_999_999_999_999_999_999n),
    "10000000000.0000",
  );
  assert.throws(() => formatStorageSol(-1n));
});

test("storage provider fetches, caching, failures, and public response policy", async (t) => {
  let now = Date.parse(fixtureRate.updatedAt);
  t.mock.method(Date, "now", () => now);
  const calls: { url: string; init?: RequestInit }[] = [];
  let upload: unknown = { winc: "13978286692065" };
  let token: unknown = { winc: "25578163265305", fees: [] };
  let fail = false;
  let hang = false;
  let status = 200;
  let raw: string | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (fail) throw new Error("Internal provider secret should never escape");
      if (hang) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("Aborted"));
          });
        });
      }
      if (status !== 200) return new Response(null, { status });
      if (raw !== undefined) return new Response(raw);
      return Response.json(input.includes("/bytes/") ? upload : token);
    },
  );

  await t.test(
    "only fixed unauthenticated reads and one pair for concurrent callers",
    async () => {
      const results = await Promise.all([
        getStorageRate(),
        getStorageRate(),
        getStorageRate(),
      ]);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls.map((call) => call.url).sort(), [
        "https://payment.ardrive.io/v1/price/bytes/1073741824",
        "https://payment.ardrive.io/v1/price/solana/1000000000",
      ]);
      for (const call of calls) {
        assert.equal(call.init?.method, "GET");
        assert.equal(call.init?.redirect, "manual");
        assert.equal(call.init?.cache, "no-store");
        assert.equal(call.init?.body, undefined);
        assert.deepEqual(call.init?.headers, { Accept: "application/json" });
        assert.ok(call.init?.signal instanceof AbortSignal);
      }
      assert.deepEqual(results[0], {
        ...fixtureRate,
        wincPerGiB: "13978286692065",
        wincPerSol: "25578163265305",
      });
      assert.deepEqual(results[1], results[0]);
      now += 14 * 60 * 1_000;
      assert.deepEqual(await getStorageRate(), results[0]);
      assert.equal(calls.length, 2);
    },
  );

  await t.test(
    "GET response is public and bounded to a short edge cache",
    async () => {
      const response = await storagePricing(
        new Request("https://nikki.test/api/storage-pricing"),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "public, max-age=60");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(await response.json(), await getStorageRate());
      assert.equal(calls.length, 2);
    },
  );

  await t.test("rejects methods without reading a rate", async () => {
    for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
      const response = await storagePricing(
        new Request("https://nikki.test/api/storage-pricing", { method }),
      );
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "GET");
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(calls.length, 2);
  });

  await t.test(
    "expired rates refresh and failures never serve stale data",
    async () => {
      now += 60 * 1_000;
      fail = true;
      await assert.rejects(getStorageRate(), /Storage rate is unavailable/);
      assert.equal(calls.length, 4);
      const response = await storagePricing(
        new Request("https://nikki.test/api/storage-pricing"),
      );
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("retry-after"), "30");
      assert.deepEqual(await response.json(), {
        error: "Live storage estimates are taking a break. Try again shortly.",
      });
      assert.equal(calls.length, 4);
      now += 30_000;
      fail = false;
      const recovered = await getStorageRate();
      assert.equal(calls.length, 6);
      assert.equal(Date.parse(recovered.updatedAt), now);
      assert.equal(Date.parse(recovered.expiresAt), now + 900_000);
    },
  );

  await t.test(
    "invalid provider prices, JSON, and oversized bodies fail closed",
    async () => {
      for (const invalid of [
        null,
        [],
        { winc: 123 },
        { winc: "0" },
        { winc: "1e20" },
        { winc: "1".repeat(41) },
      ]) {
        now += 900_000;
        upload = invalid;
        await assert.rejects(getStorageRate(), /Storage rate is unavailable/);
      }
      upload = { winc: "13978286692065" };
      token = { winc: "-1" };
      now += 900_000;
      await assert.rejects(getStorageRate(), /Storage rate is unavailable/);
      for (const invalid of [
        "not json",
        JSON.stringify({ winc: "1", padding: "x".repeat(4096) }),
      ]) {
        now += 900_000;
        raw = invalid;
        await assert.rejects(getStorageRate(), /Storage rate is unavailable/);
      }
    },
  );

  await t.test(
    "unsuccessful provider HTTP responses are unavailable",
    async () => {
      raw = undefined;
      for (const failureStatus of [301, 302, 429, 503]) {
        status = failureStatus;
        now += 900_000;
        await assert.rejects(getStorageRate(), /Storage rate is unavailable/);
      }
      status = 200;
    },
  );

  await t.test(
    "unresponsive provider reads abort after five seconds",
    async (timeoutTest) => {
      timeoutTest.mock.timers.enable({ apis: ["setTimeout"] });
      now += 900_000;
      hang = true;
      const request = getStorageRate();
      timeoutTest.mock.timers.tick(5_000);
      await assert.rejects(request, /Storage rate is unavailable/);
      assert.ok(calls.slice(-2).every((call) => call.init?.signal?.aborted));
    },
  );
});
