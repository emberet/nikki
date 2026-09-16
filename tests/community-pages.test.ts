import test from "node:test";
import assert from "node:assert/strict";
import worker from "../creator-worker/index";
import type { Env } from "../creator-worker/types";

const mint = "GxoppHqopqWPHAMzAw9QsbjyPzRwHUG5TNzvcjB7pump";
function environment(
  community: { name: string; description: string } | null,
): Env {
  return {
    PUBLIC_ORIGIN: "https://nikki.test",
    CREATORS_DB: {
      prepare: () => ({
        bind() {
          return this;
        },
        async first() {
          return community;
        },
      }),
    } as any,
    ASSETS: {
      async fetch() {
        return new Response(
          '<!doctype html><html><head><title>Community — Nikki</title><meta name="description" content="Original"><meta property="og:title" content="Original"><meta property="og:description" content="Original"><link rel="canonical" href="https://nikki.test/communities/detail/"><meta property="og:url" content="https://nikki.test/communities/detail/"></head><body>Community shell</body></html>',
          {
            headers: {
              "Content-Type": "text/html",
              "Content-Security-Policy": "img-src 'self'",
              ETag: '"static-shell"',
            },
          },
        );
      },
    },
  };
}

test("community HTML escapes imported names and descriptions and has its own canonical identity", async () => {
  const response = await worker.fetch(
    new Request("https://nikki.test/communities/" + mint + "/"),
    environment({
      name: "</title><script>alert(1)</script>",
      description: '" onload="alert(1)',
    }),
    { waitUntil() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(
    html.includes("&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;"),
  );
  assert.ok(html.includes("&quot; onload=&quot;alert(1)"));
  assert.ok(!html.includes("<script>"));
  assert.ok(
    html.includes('href="https://nikki.test/communities/' + mint + '/"'),
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("etag"), null);
  assert.ok(
    response.headers
      .get("content-security-policy")
      ?.includes("img-src 'self' https:"),
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("an unknown community is a real 404 instead of a generic success page", async () => {
  const response = await worker.fetch(
    new Request("https://nikki.test/communities/" + mint + "/"),
    environment(null),
    { waitUntil() {} },
  );
  assert.equal(response.status, 404);
});

test("community directory overrides the static image policy without combining restrictive policies", async () => {
  const response = await worker.fetch(
    new Request("https://nikki.test/communities/"),
    environment(null),
    { waitUntil() {} },
  );
  const csp = response.headers.get("content-security-policy")!;
  assert.equal(csp.split("img-src").length, 2);
  assert.ok(csp.includes("img-src 'self' https:"));
  assert.ok(csp.includes("script-src 'self'"));
});
