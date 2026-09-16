import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import { communitiesApi } from "../creator-worker/communities";
import {
  ApiError,
  hash,
  json,
  now,
  random,
  sameOrigin,
} from "../creator-worker/common";
import type { Env } from "../creator-worker/types";
import type { resolveCommunityToken } from "../creator-worker/community-token";
import worker from "../creator-worker/index";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const draft = {
  name: "Friends of Nikki",
  description: "A home for stories.",
  logoUrl: "https://arweave.net/logo",
  websiteUrl: "https://example.com",
  xUrl: "https://x.com/nikkistreams",
  telegramUrl: "",
  accent: "purple",
};
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(
    new URL("../creator-worker/migrations/", import.meta.url),
  )
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sql.exec(
      readFileSync(
        new URL("../creator-worker/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  class Statement {
    args: any[] = [];
    constructor(public query: string) {}
    bind(...args: any[]) {
      this.args = args;
      return this;
    }
    async first() {
      return sql.prepare(this.query).get(...this.args) || null;
    }
    async all() {
      return { results: sql.prepare(this.query).all(...this.args) };
    }
    async run() {
      return { meta: sql.prepare(this.query).run(...this.args) };
    }
  }
  const env: Env = {
    PUBLIC_ORIGIN: "https://nikki.test",
    CREATORS_DB: {
      prepare: (query) => new Statement(query) as any,
      async batch(statements: any[]) {
        sql.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          sql.exec("COMMIT");
          return results;
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      },
    },
    ASSETS: { fetch: async () => new Response("asset") },
  };
  let authority = true,
    holder = false;
  const calls: string[] = [];
  const resolver: typeof resolveCommunityToken = async (_env, mint, actor) => {
    calls.push(mint);
    return {
      mint,
      name: "Nikki Token",
      symbol: "NIKKI",
      description: "From token metadata",
      logoUrl: draft.logoUrl,
      bannerUrl: "",
      sourceUrl: "",
      sources: [],
      websiteUrl: draft.websiteUrl,
      xUrl: draft.xUrl,
      telegramUrl: "",
      metadataUri: "https://arweave.net/metadata",
      authorityWallet: authority ? actor! : null,
      authorityKind: authority ? "pump_creator" : null,
      actorIsAuthority: authority,
      actorIsHolder: holder,
      warnings: [],
    };
  };
  const ip = random();
  async function call(
    route = "/communities",
    data?: unknown,
    cookie = "",
    origin = env.PUBLIC_ORIGIN!,
  ) {
    const req = new Request(env.PUBLIC_ORIGIN + "/api/creators" + route, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie,
        "cf-connecting-ip": ip,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    try {
      if (req.method !== "GET") sameOrigin(req, env);
      return (await communitiesApi(req, env, route.split("?")[0], resolver))!;
    } catch (error) {
      if (error instanceof ApiError)
        return json({ error: error.message }, error.status);
      throw error;
    }
  }
  async function login(paired = true, xId = random()) {
    const address = Keypair.generate().publicKey.toBase58(),
      secret = random();
    sql
      .prepare(
        "INSERT INTO creator_users(wallet,x_id,x_username,created_at) VALUES(?,?,?,?)",
      )
      .run(address, paired ? xId : null, paired ? "nikkiuser" : null, now());
    sql
      .prepare(
        "INSERT INTO creator_sessions(token_hash,wallet,expires_at) VALUES(?,?,?)",
      )
      .run(await hash(secret), address, now() + 3600);
    return { address, cookie: "nikki_creator=" + secret, xId };
  }
  async function create(
    owner: Awaited<ReturnType<typeof login>>,
    mint = Keypair.generate().publicKey.toBase58(),
  ) {
    const response = await call(
      "/communities",
      { ...draft, mint },
      owner.cookie,
    );
    assert.equal(response.status, 201, await response.clone().text());
    return { mint, data: (await response.json()) as any };
  }
  return {
    sql,
    env,
    call,
    login,
    create,
    calls,
    eligibility(a: boolean, h: boolean) {
      authority = a;
      holder = h;
    },
  };
}

test("community imports require wallet/X and fresh token authority or holdings; never alter creator tokens", async () => {
  const f = fixture(),
    owner = await f.login(),
    walletOnly = await f.login(false),
    mint = Keypair.generate().publicKey.toBase58();
  assert.equal((await f.call("/communities/preview", { mint })).status, 401);
  assert.equal(
    (await f.call("/communities/preview", { mint }, walletOnly.cookie)).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        "/communities",
        { ...draft, mint },
        owner.cookie,
        "https://evil.test",
      )
    ).status,
    403,
  );
  let preview = (await (
    await f.call("/communities/preview", { mint }, owner.cookie)
  ).json()) as any;
  assert.equal(preview.eligibility.role, "token-authority");
  f.eligibility(false, false);
  assert.equal(
    (
      await f.call(
        "/communities",
        { ...draft, mint, importRole: "token-authority" },
        owner.cookie,
      )
    ).status,
    403,
  );
  f.eligibility(false, true);
  const result = await f.create(owner, mint);
  assert.equal(result.data.community.importRole, "community-led");
  assert.equal(result.data.community.authorityKind, null);
  assert.equal(result.data.community.authorityVerifiedAt, null);
  assert.equal(result.data.joined, true);
  assert.equal(result.data.community.memberCount, 1);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM creator_tokens").get().n,
    0,
  );
  assert.equal(
    (await f.call("/communities", { ...draft, mint }, owner.cookie)).status,
    409,
  );
  preview = (await (
    await f.call("/communities/preview", { mint }, owner.cookie)
  ).json()) as any;
  assert.equal(preview.existingCommunity, mint);
  assert.equal(preview.eligibility.canImport, false);
});

test("community profile edits enforce organizer ownership, immutable mint, safe links and snapshot token details", async () => {
  const f = fixture(),
    owner = await f.login(),
    stranger = await f.login(),
    { mint } = await f.create(owner);
  const endpoint = "/communities/" + mint + "/profile";
  assert.equal((await f.call(endpoint, draft, stranger.cookie)).status, 403);
  assert.equal(
    (await f.call(endpoint, { ...draft, mint: stranger.address }, owner.cookie))
      .status,
    400,
  );
  for (const patch of [
    { logoUrl: "javascript:alert(1)" },
    { websiteUrl: "https://127.0.0.1/" },
    { xUrl: "https://evil.example/x.com" },
    { name: "" },
    { description: "x".repeat(1001) },
  ])
    assert.equal(
      (await f.call(endpoint, { ...draft, ...patch }, owner.cookie)).status,
      400,
    );
  const updated = await f.call(
    endpoint,
    {
      ...draft,
      name: "Fresh community",
      tokenName: "Spoofed",
      tokenSymbol: "SPOOF",
      importRole: "community-led",
    },
    owner.cookie,
  );
  assert.equal(updated.status, 200);
  const row = ((await updated.json()) as any).community;
  assert.equal(row.name, "Fresh community");
  assert.equal(row.tokenName, "Nikki Token");
  assert.equal(row.tokenSymbol, "NIKKI");
  assert.equal(row.importRole, "token-authority");
  assert.ok(row.authorityVerifiedAt > 0);
});

test("community browsing searches literal queries and paginates without chain access or draft profile leakage", async () => {
  const f = fixture(),
    owner = await f.login(),
    { mint } = await f.create(owner);
  const resolverCalls = f.calls.length;
  const listing = await f.call("/communities?q=NIKKI");
  assert.equal(listing.headers.get("cache-control"), "no-store");
  assert.equal(((await listing.json()) as any).communities.length, 1);
  assert.equal(
    ((await (await f.call("/communities?q=%25")).json()) as any).total,
    0,
  );
  assert.equal((await f.call("/communities?offset=-1")).status, 400);
  const detail = (await (await f.call("/communities/" + mint)).json()) as any;
  assert.equal(detail.user, null);
  assert.equal(detail.joined, false);
  assert.deepEqual(detail.permissions, {
    canPost: false,
    canEdit: false,
    canModerate: false,
    canJoin: false,
  });
  assert.equal((await f.call("/communities/" + owner.address)).status, 404);
  assert.equal(f.calls.length, resolverCalls);
  const insert = f.sql.prepare(
    "INSERT INTO communities(mint,owner_wallet,name,accent,token_name,token_symbol,import_role,created_at,updated_at) VALUES(?,?,?,'purple','Token','TKN','community-led',?,?)",
  );
  for (let i = 0; i < 29; i++)
    insert.run(
      Keypair.generate().publicKey.toBase58(),
      (await f.login()).address,
      "Community " + i,
      now(),
      now(),
    );
  const first = (await (await f.call("/communities")).json()) as any;
  assert.equal(first.communities.length, 25);
  assert.equal(first.nextOffset, 25);
  insert.run(
    Keypair.generate().publicKey.toBase58(),
    (await f.login()).address,
    "New arrival",
    now(),
    now(),
  );
  const second = (await (await f.call("/communities?offset=25")).json()) as any;
  assert.equal(second.communities.length, 6);
  assert.equal(second.nextOffset, null);
  assert.equal(
    new Set(
      [...first.communities, ...second.communities].map((r: any) => r.mint),
    ).size,
    31,
  );
});

test("joining is free, wallet-only and idempotent; owner permissions survive leaving", async () => {
  const f = fixture(),
    owner = await f.login(),
    member = await f.login(false),
    { mint } = await f.create(owner),
    path = "/communities/" + mint;
  assert.equal(
    (await f.call(path + "/membership", { joined: true })).status,
    401,
  );
  assert.equal(
    (await f.call(path + "/membership", { joined: "true" }, member.cookie))
      .status,
    400,
  );
  for (let i = 0; i < 2; i++) {
    const joined = (await (
      await f.call(path + "/membership", { joined: true }, member.cookie)
    ).json()) as any;
    assert.equal(joined.joined, true);
    assert.equal(joined.memberCount, 2);
  }
  const detail = (await (
    await f.call(path, undefined, member.cookie)
  ).json()) as any;
  assert.equal(detail.joined, true);
  assert.equal(detail.permissions.canPost, false);
  assert.equal(
    (await f.call(path + "/membership", { joined: false }, owner.cookie))
      .status,
    200,
  );
  const own = (await (
    await f.call(path, undefined, owner.cookie)
  ).json()) as any;
  assert.equal(own.joined, false);
  assert.equal(own.permissions.canEdit, true);
  assert.equal(f.calls.length, 1);
});

test("free posts validate paired identity and text, isolate idempotency by wallet, and protect unpublished profiles", async () => {
  const f = fixture(),
    owner = await f.login(),
    member = await f.login(),
    walletOnly = await f.login(false),
    { mint } = await f.create(owner),
    path = "/communities/" + mint + "/posts",
    clientId = random();
  f.sql
    .prepare(
      "INSERT INTO creator_profiles(wallet,handle,display_name,bio,category,accent,published,created_at,updated_at) VALUES(?,?,?,'private bio','History','purple',0,?,?)",
    )
    .run(member.address, "private", "PRIVATE DRAFT", now(), now());
  assert.equal(
    (await f.call(path, { text: "hello", clientId }, walletOnly.cookie)).status,
    403,
  );
  for (const text of ["", " ", "x".repeat(2001), "hi\u0001there"])
    assert.equal(
      (await f.call(path, { text, clientId }, member.cookie)).status,
      400,
    );
  const content = "<script>alert('hi')</script> A plain-text post.",
    one = await f.call(path, { text: content, clientId }, member.cookie);
  assert.equal(one.status, 201);
  const first = (await one.json()) as any;
  assert.equal(first.post.text, content);
  assert.equal(first.post.author.displayName, "@nikkiuser");
  assert.equal(first.post.author.handle, null);
  const retry = await f.call(path, { text: content, clientId }, member.cookie);
  assert.equal(retry.status, 200);
  assert.equal(((await retry.json()) as any).post.id, first.post.id);
  assert.equal(
    (await f.call(path, { text: "changed", clientId }, member.cookie)).status,
    409,
  );
  assert.equal(
    (await f.call(path, { text: content, clientId }, owner.cookie)).status,
    201,
  );
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM community_posts").get().n,
    2,
  );
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM creator_intents").get().n,
    0,
  );
});

test("post pagination stays stable under new posts/deletion and other communities remain isolated", async () => {
  const f = fixture(),
    owner = await f.login(),
    { mint } = await f.create(owner),
    other = await f.create(owner),
    path = "/communities/" + mint + "/posts";
  const add = f.sql.prepare(
    "INSERT INTO community_posts(mint,wallet,client_id,text,created_at) VALUES(?,?,?,?,?)",
  );
  for (let i = 0; i < 30; i++)
    add.run(mint, owner.address, random(), "Post " + i, now());
  add.run(other.mint, owner.address, random(), "OTHER COMMUNITY", now());
  const first = (await (await f.call(path)).json()) as any;
  assert.equal(first.posts.length, 25);
  assert.equal(first.posts[0].text, "Post 29");
  add.run(mint, owner.address, random(), "NEW ARRIVAL", now());
  f.sql.prepare("UPDATE community_posts SET state='deleted' WHERE id=2").run();
  const next = (await (
    await f.call(path + "?before=" + first.nextCursor)
  ).json()) as any;
  assert.equal(next.posts.length, 4);
  assert.equal(next.nextCursor, null);
  assert.equal(
    new Set([...first.posts, ...next.posts].map((p: any) => p.id)).size,
    29,
  );
  assert.ok(
    !next.posts.some(
      (p: any) => p.text === "NEW ARRIVAL" || p.text === "OTHER COMMUNITY",
    ),
  );
  assert.equal((await f.call(path + "?before=bad")).status, 400);
});

test("post removal supports author deletion and audited organizer/founder moderation without resurrection", async () => {
  const f = fixture(),
    owner = await f.login(),
    member = await f.login(),
    stranger = await f.login(),
    founder = await f.login(false),
    { mint } = await f.create(owner),
    path = "/communities/" + mint + "/posts",
    clientId = random();
  f.env.FOUNDER_WALLET = founder.address;
  const created = (await (
      await f.call(path, { text: "First post", clientId }, member.cookie)
    ).json()) as any,
    id = created.post.id;
  assert.equal(
    (await f.call(path + "/" + id + "/delete", {}, stranger.cookie)).status,
    403,
  );
  assert.equal(
    (await f.call(path + "/" + id + "/delete", {}, owner.cookie)).status,
    200,
  );
  assert.equal(
    f.sql.prepare("SELECT state FROM community_posts WHERE id=?").get(id).state,
    "hidden",
  );
  assert.equal(((await (await f.call(path)).json()) as any).posts.length, 0);
  assert.equal(
    (await f.call(path, { text: "First post", clientId }, member.cookie))
      .status,
    409,
  );
  assert.equal(
    (await f.call(path + "/" + id + "/delete", {}, member.cookie)).status,
    200,
  );
  assert.deepEqual(
    {
      ...f.sql
        .prepare("SELECT state,text FROM community_posts WHERE id=?")
        .get(id),
    },
    { state: "deleted", text: "" },
  );
  const second = (await (
    await f.call(path, { text: "Next post", clientId: random() }, member.cookie)
  ).json()) as any;
  assert.equal(
    (await f.call(path + "/" + second.post.id + "/delete", {}, founder.cookie))
      .status,
    200,
  );
  assert.equal(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM creator_ops_audit WHERE action='community-post-hide'",
      )
      .get().n,
    2,
  );
});

test("post rate limits share X identity across wallets and successful retries remain idempotent", async () => {
  const f = fixture(),
    owner = await f.login(),
    first = await f.login(true, "shared-x"),
    second = await f.login(true, "shared-x"),
    { mint } = await f.create(owner),
    path = "/communities/" + mint + "/posts";
  const saved = { text: "Post 0", clientId: random() };
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await f.call(
          path,
          i === 0 ? saved : { text: "Post " + i, clientId: random() },
          first.cookie,
        )
      ).status,
      201,
    );
  assert.equal((await f.call(path, saved, first.cookie)).status, 200);
  assert.equal(
    (
      await f.call(
        path,
        { text: "One too many", clientId: random() },
        second.cookie,
      )
    ).status,
    429,
  );
});

test("atomic bootstrap quotas bound free writes while allowing idempotent updates", async () => {
  const f = fixture(),
    owner = await f.login(),
    { mint } = await f.create(owner),
    add = f.sql.prepare(
      "INSERT INTO community_posts(mint,wallet,client_id,text,created_at) VALUES(?,?,?,?,?)",
    );
  for (let i = 0; i < 1000; i++)
    add.run(mint, owner.address, "key-" + i, "bounded", now());
  assert.throws(
    () => add.run(mint, owner.address, "overflow", "bounded", now()),
    /COMMUNITY_POSTS_OWNER_FULL/,
  );
  assert.doesNotThrow(() =>
    f.sql
      .prepare(
        "INSERT INTO community_posts(mint,wallet,client_id,text,created_at) VALUES(?,?,?,?,?) ON CONFLICT(wallet,client_id) DO NOTHING",
      )
      .run(mint, owner.address, "key-0", "bounded", now()),
  );
  const reply = await f.call(
    "/communities/" + mint + "/posts",
    { text: "No room", clientId: random() },
    owner.cookie,
  );
  assert.equal(reply.status, 409);
});

test("worker integration exposes public communities and rejects cross-origin or unauthenticated mutations", async () => {
  const f = fixture();
  const get = await worker.fetch(
    new Request(f.env.PUBLIC_ORIGIN + "/api/creators/communities"),
    f.env,
    { waitUntil() {} },
  );
  assert.equal(get.status, 200);
  assert.deepEqual(((await get.json()) as any).communities, []);
  const request = (origin: string) =>
    new Request(f.env.PUBLIC_ORIGIN + "/api/creators/communities", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "{}",
    });
  assert.equal(
    (
      await worker.fetch(request("https://evil.test"), f.env, {
        waitUntil() {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.fetch(request(f.env.PUBLIC_ORIGIN!), f.env, {
        waitUntil() {},
      })
    ).status,
    401,
  );
});

test("concurrent moderation cannot change author-deleted posts or duplicate audit entries", async () => {
  for (const competingState of ["deleted", "hidden"]) {
    const f = fixture(),
      owner = await f.login(),
      member = await f.login(),
      { mint } = await f.create(owner),
      path = "/communities/" + mint + "/posts";
    const created = (await (
      await f.call(
        path,
        { text: "Post under review", clientId: random() },
        member.cookie,
      )
    ).json()) as any;
    const originalBatch = f.env.CREATORS_DB.batch.bind(f.env.CREATORS_DB);
    f.env.CREATORS_DB.batch = async (statements) => {
      // Another writer commits after the route reads its initial visible state.
      f.sql
        .prepare(
          "UPDATE community_posts SET state=?,text=CASE WHEN ?='deleted' THEN '' ELSE text END WHERE id=?",
        )
        .run(competingState, competingState, created.post.id);
      return originalBatch(statements);
    };
    const response = await f.call(
      path + "/" + created.post.id + "/delete",
      {},
      owner.cookie,
    );
    assert.equal(response.status, 200);
    assert.equal(
      f.sql
        .prepare("SELECT state FROM community_posts WHERE id=?")
        .get(created.post.id).state,
      competingState,
    );
    assert.equal(
      f.sql.prepare("SELECT count(*) AS n FROM creator_ops_audit").get().n,
      0,
    );
  }
});

test("cross-community post identifiers cannot overwrite or delete another community's post", async () => {
  const f = fixture(),
    owner = await f.login(),
    first = await f.create(owner),
    other = await f.create(owner),
    clientId = random();
  const path = "/communities/" + first.mint + "/posts",
    otherPath = "/communities/" + other.mint + "/posts";
  const created = (await (
    await f.call(path, { text: "Belongs to first", clientId }, owner.cookie)
  ).json()) as any;
  assert.equal(
    (
      await f.call(
        otherPath,
        { text: "Belongs to first", clientId },
        owner.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.call(
        otherPath + "/" + created.post.id + "/delete",
        {},
        owner.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    f.sql
      .prepare("SELECT state FROM community_posts WHERE id=?")
      .get(created.post.id).state,
    "visible",
  );
});
