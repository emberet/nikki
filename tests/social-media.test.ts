import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import {
  contentMediaApi,
  cleanupContentMedia,
} from "../creator-worker/content-media";
import { channelPostsApi } from "../creator-worker/channel-posts";
import { communitiesApi } from "../creator-worker/communities";
import worker from "../creator-worker/index";
import {
  ApiError,
  hash,
  json,
  now,
  random,
  sameOrigin,
} from "../creator-worker/common";
import type { Env } from "../creator-worker/types";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
function jpeg(width = 480, height = 320, bytes = 20) {
  const value = new Uint8Array(bytes);
  value.set([
    255,
    216,
    255,
    192,
    0,
    8,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
  ]);
  value.set([255, 217], value.length - 2);
  return value;
}
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
  const objects = new Map<string, Uint8Array>();
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
    CREATOR_MEDIA: {
      async put(key, value) {
        objects.set(key, new Uint8Array(value));
      },
      async get(key) {
        const bytes = objects.get(key);
        return bytes
          ? {
              body: new Response(new Uint8Array(bytes).buffer).body!,
              httpEtag: '"image"',
            }
          : null;
      },
      async delete(key) {
        objects.delete(key);
      },
    },
    ASSETS: { fetch: async () => new Response("asset") },
  };
  async function login(paired = true) {
    const address = Keypair.generate().publicKey.toBase58(),
      secret = random(),
      handle = "user_" + random().slice(0, 8);
    sql
      .prepare(
        "INSERT INTO creator_users(wallet,x_id,x_username,created_at) VALUES(?,?,?,?)",
      )
      .run(address, paired ? random() : null, paired ? handle : null, now());
    sql
      .prepare(
        "INSERT INTO creator_sessions(token_hash,wallet,expires_at) VALUES(?,?,?)",
      )
      .run(await hash(secret), address, now() + 3600);
    return { address, cookie: "nikki_creator=" + secret, handle };
  }
  function channel(user: Awaited<ReturnType<typeof login>>, published = 1) {
    sql
      .prepare(
        "INSERT INTO creator_profiles(wallet,handle,display_name,bio,category,accent,published,created_at,updated_at) VALUES(?,?,?,'','History','purple',?,?,?)",
      )
      .run(user.address, user.handle, "Test Creator", published, now(), now());
    return "/channels/" + user.handle + "/posts";
  }
  function community(user: Awaited<ReturnType<typeof login>>) {
    const mint = Keypair.generate().publicKey.toBase58();
    sql
      .prepare(
        "INSERT INTO communities(mint,owner_wallet,name,accent,token_name,token_symbol,import_role,created_at,updated_at) VALUES(?,?,'Test community','purple','Token','TKN','community-led',?,?)",
      )
      .run(mint, user.address, now(), now());
    return "/communities/" + mint;
  }
  async function call(
    route: string,
    data?: unknown,
    cookie = "",
    extra: Record<string, string> = {},
  ) {
    const raw = data instanceof Uint8Array;
    const req = new Request(env.PUBLIC_ORIGIN + "/api/creators" + route, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        origin: env.PUBLIC_ORIGIN!,
        "content-type": raw ? "image/jpeg" : "application/json",
        cookie,
        ...extra,
      },
      body:
        data === undefined
          ? undefined
          : raw
            ? new Uint8Array(data).buffer
            : JSON.stringify(data),
    });
    try {
      if (req.method !== "GET") sameOrigin(req, env);
      const path = route.split("?")[0];
      return (
        (await contentMediaApi(req, env, path)) ||
        (await channelPostsApi(req, env, path)) ||
        (await communitiesApi(req, env, path))!
      );
    } catch (error) {
      if (error instanceof ApiError)
        return json({ error: error.message }, error.status);
      throw error;
    }
  }
  async function upload(
    user: Awaited<ReturnType<typeof login>>,
    kind = "post-image",
  ) {
    const response = await call(
      "/content/media?kind=" + kind,
      jpeg(),
      user.cookie,
    );
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()) as any;
  }
  return { sql, env, objects, login, channel, community, call, upload };
}

test("device uploads require paired identity, valid bounded JPEG and matching dimensions", async () => {
  const f = fixture(),
    owner = await f.login(),
    walletOnly = await f.login(false);
  assert.equal(
    (await f.call("/content/media?kind=post-image", jpeg())).status,
    401,
  );
  assert.equal(
    (await f.call("/content/media?kind=post-image", jpeg(), walletOnly.cookie))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call("/content/media?kind=post-image", jpeg(), owner.cookie, {
        origin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.call("/content/media?kind=bad", jpeg(), owner.cookie)).status,
    400,
  );
  assert.equal(
    (
      await f.call("/content/media?kind=post-image", jpeg(), owner.cookie, {
        "content-type": "image/svg+xml",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await f.call(
        "/content/media?kind=post-image",
        new Uint8Array([1, 2, 3]),
        owner.cookie,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await f.call(
        "/content/media?kind=community-logo",
        jpeg(600, 400),
        owner.cookie,
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await f.call(
        "/content/media?kind=post-image",
        jpeg(1601, 400),
        owner.cookie,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await f.call(
        "/content/media?kind=post-image",
        jpeg(480, 320, 524289),
        owner.cookie,
      )
    ).status,
    413,
  );
  const asset = await f.upload(owner);
  assert.equal(asset.width, 480);
  assert.equal(asset.height, 320);
  assert.equal(f.objects.size, 1);
  assert.equal((await f.call("/content/media/" + asset.id)).status, 404);
  const preview = await f.call(
    "/content/media/" + asset.id,
    undefined,
    owner.cookie,
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "no-store");
});

test("community device artwork checks ownership/kind and takes precedence over imported URLs", async () => {
  const f = fixture(),
    owner = await f.login(),
    stranger = await f.login(),
    path = f.community(owner),
    logo = await f.upload(owner, "community-logo"),
    banner = await f.upload(owner, "community-banner"),
    foreign = await f.upload(stranger, "community-logo"),
    postImage = await f.upload(owner),
    draft = {
      name: "My community",
      description: "A place",
      accent: "purple",
      logoUrl: "https://example.com/logo.jpg",
      bannerUrl: "https://example.com/banner.jpg",
      websiteUrl: "",
      xUrl: "",
      telegramUrl: "",
    };
  assert.equal(
    (
      await f.call(
        path + "/profile",
        { ...draft, logoAssetId: foreign.id },
        owner.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        path + "/profile",
        { ...draft, logoAssetId: postImage.id },
        owner.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        path + "/profile",
        { ...draft, logoAssetId: logo.id },
        stranger.cookie,
      )
    ).status,
    403,
  );
  const response = await f.call(
    path + "/profile",
    { ...draft, logoAssetId: logo.id, bannerAssetId: banner.id },
    owner.cookie,
  );
  assert.equal(response.status, 200);
  const c = ((await response.json()) as any).community;
  assert.equal(c.logoUrl, logo.url);
  assert.equal(c.bannerUrl, banner.url);
  assert.equal(c.logoAssetId, logo.id);
  assert.equal(c.bannerAssetId, banner.id);
  assert.equal((await f.call("/content/media/" + logo.id)).status, 200);
  assert.equal((await f.call("/content/media/" + banner.id)).status, 200);
  await f.call(path + "/profile", { ...draft, name: "Renamed" }, owner.cookie);
  assert.equal(
    ((await (await f.call(path)).json()) as any).community.logoUrl,
    logo.url,
  );
  await f.call(
    path + "/profile",
    { ...draft, logoAssetId: null, bannerAssetId: null },
    owner.cookie,
  );
  const fallback = ((await (await f.call(path)).json()) as any).community;
  assert.equal(fallback.logoUrl, draft.logoUrl);
  assert.equal(fallback.bannerUrl, draft.bannerUrl);
  assert.equal((await f.call("/content/media/" + logo.id)).status, 404);
});

test("all published channel owners can post free text or images without a token, others cannot", async () => {
  const f = fixture(),
    owner = await f.login(),
    stranger = await f.login(),
    walletOnly = await f.login(false),
    path = f.channel(owner);
  f.channel(walletOnly);
  assert.equal(
    (await f.call(path, { text: "hi", clientId: random() })).status,
    401,
  );
  assert.equal(
    (await f.call(path, { text: "hi", clientId: random() }, stranger.cookie))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call(
        "/channels/" + walletOnly.handle + "/posts",
        { text: "hi", clientId: random() },
        walletOnly.cookie,
      )
    ).status,
    404,
  );
  const initial = (await (await f.call(path)).json()) as any;
  assert.equal(initial.posts.length, 0);
  assert.equal(initial.permissions.canPost, false);
  assert.equal(
    ((await (await f.call(path, undefined, owner.cookie)).json()) as any)
      .permissions.canPost,
    true,
  );
  assert.equal(
    (await f.call(path, { text: "", clientId: random() }, owner.cookie)).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        path,
        { text: "x".repeat(2001), clientId: random() },
        owner.cookie,
      )
    ).status,
    400,
  );
  const asset = await f.upload(owner),
    request = {
      imageId: asset.id,
      imageAlt: "A purple Nikki",
      clientId: random(),
    };
  const imagePost = await f.call(path, request, owner.cookie);
  assert.equal(imagePost.status, 201);
  const p = ((await imagePost.json()) as any).post;
  assert.equal(p.text, "");
  assert.deepEqual(p.image, {
    id: asset.id,
    url: asset.url,
    width: 480,
    height: 320,
    alt: "A purple Nikki",
  });
  assert.equal((await f.call("/content/media/" + asset.id)).status, 200);
  assert.equal((await f.call(path, request, owner.cookie)).status, 200);
  assert.equal(
    (await f.call(path, { ...request, imageAlt: "Changed" }, owner.cookie))
      .status,
    409,
  );
  assert.equal(
    (
      await f.call(
        path,
        { text: "<b>plain text</b>", clientId: random() },
        owner.cookie,
      )
    ).status,
    201,
  );
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM creator_tokens").get().n,
    0,
  );
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM creator_intents").get().n,
    0,
  );
});

test("community image-only posts are idempotent and never accept another wallet's images", async () => {
  const f = fixture(),
    owner = await f.login(),
    member = await f.login(),
    path = f.community(owner) + "/posts",
    asset = await f.upload(member),
    foreign = await f.upload(owner),
    wrongKind = await f.upload(member, "community-logo"),
    request = { imageId: asset.id, imageAlt: "Nikki art", clientId: random() };
  assert.equal(
    (await f.call(path, { ...request, imageId: foreign.id }, member.cookie))
      .status,
    400,
  );
  assert.equal(
    (await f.call(path, { ...request, imageId: wrongKind.id }, member.cookie))
      .status,
    400,
  );
  assert.equal(
    (
      await f.call(
        path,
        { ...request, imageAlt: "x".repeat(241) },
        member.cookie,
      )
    ).status,
    400,
  );
  const response = await f.call(path, request, member.cookie);
  assert.equal(response.status, 201);
  const p = ((await response.json()) as any).post;
  assert.equal(p.image.url, asset.url);
  assert.equal(p.image.alt, "Nikki art");
  assert.equal((await f.call(path, request, member.cookie)).status, 200);
  assert.equal(
    (await f.call(path, { ...request, text: "different" }, member.cookie))
      .status,
    409,
  );
  const replacement = await f.upload(member);
  assert.equal(
    (await f.call(path, { ...request, imageId: replacement.id }, member.cookie))
      .status,
    409,
  );
  assert.equal(
    (await f.call(path + "/" + p.id + "/delete", {}, member.cookie)).status,
    200,
  );
  assert.equal((await f.call("/content/media/" + asset.id)).status, 404);
  assert.equal((await f.call(path, request, member.cookie)).status, 409);
});

test("channel moderation/deletion immediately hides images, prevents replay and audits once", async () => {
  const f = fixture(),
    owner = await f.login(),
    stranger = await f.login(),
    founder = await f.login(false),
    path = f.channel(owner),
    asset = await f.upload(owner),
    request = { text: "hello", imageId: asset.id, clientId: random() };
  f.env.FOUNDER_WALLET = founder.address;
  const p = ((await (await f.call(path, request, owner.cookie)).json()) as any)
    .post;
  assert.equal(
    (await f.call(path + "/" + p.id + "/delete", {}, stranger.cookie)).status,
    403,
  );
  assert.equal(
    (await f.call(path + "/" + p.id + "/delete", {}, founder.cookie)).status,
    200,
  );
  assert.equal(
    (await f.call(path + "/" + p.id + "/delete", {}, founder.cookie)).status,
    200,
  );
  assert.equal((await f.call("/content/media/" + asset.id)).status, 404);
  assert.equal(
    (await f.call("/content/media/" + asset.id, undefined, owner.cookie))
      .status,
    404,
  );
  assert.equal(((await (await f.call(path)).json()) as any).posts.length, 0);
  assert.equal((await f.call(path, request, owner.cookie)).status, 409);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM creator_ops_audit").get().n,
    1,
  );
  await f.call(path + "/" + p.id + "/delete", {}, owner.cookie);
  const row = f.sql
    .prepare(
      "SELECT state,text,image_id,image_alt FROM channel_posts WHERE id=?",
    )
    .get(p.id);
  assert.deepEqual(
    { ...row },
    { state: "deleted", text: "", image_id: null, image_alt: "" },
  );
});

test("draft/unpublished channels expose neither posts nor images", async () => {
  const f = fixture(),
    owner = await f.login(),
    path = f.channel(owner),
    asset = await f.upload(owner);
  await f.call(path, { imageId: asset.id, clientId: random() }, owner.cookie);
  f.sql
    .prepare("UPDATE creator_profiles SET published=0 WHERE wallet=?")
    .run(owner.address);
  assert.equal((await f.call(path)).status, 404);
  assert.equal((await f.call("/content/media/" + asset.id)).status, 404);
  assert.equal(
    (await f.call(path, { text: "nope", clientId: random() }, owner.cookie))
      .status,
    404,
  );
});

test("cleanup expires only unattached media and claims it before R2 deletion to prevent attachment races", async () => {
  const f = fixture(),
    owner = await f.login(),
    path = f.channel(owner),
    pending = await f.upload(owner),
    published = await f.upload(owner),
    fresh = await f.upload(owner);
  await f.call(
    path,
    { imageId: published.id, clientId: random() },
    owner.cookie,
  );
  f.sql
    .prepare("UPDATE content_assets SET created_at=? WHERE id IN (?,?)")
    .run(now() - 90000, pending.id, published.id);
  const deleted: string[] = [];
  f.env.CREATOR_MEDIA!.delete = async (key) => {
    deleted.push(key);
    const row = f.sql
      .prepare("SELECT id,ready FROM content_assets WHERE object_key=?")
      .get(key);
    assert.equal(row.ready, 2);
    assert.throws(
      () =>
        f.sql
          .prepare(
            "INSERT INTO channel_posts(channel_wallet,wallet,client_id,text,image_id,created_at) VALUES(?,?,?,'',?,?)",
          )
          .run(owner.address, owner.address, random(), row.id, now()),
      /CONTENT_ASSET_INVALID/,
    );
    f.objects.delete(key);
  };
  await cleanupContentMedia(f.env);
  assert.equal(deleted.length, 1);
  assert.equal(
    f.sql.prepare("SELECT id FROM content_assets WHERE id=?").get(pending.id),
    undefined,
  );
  assert.equal((await f.call("/content/media/" + published.id)).status, 200);
  assert.equal(
    (await f.call("/content/media/" + fresh.id, undefined, owner.cookie))
      .status,
    200,
  );
});

test("atomic storage quota and attachment constraints cannot be bypassed through overlapping writes", async () => {
  const f = fixture(),
    owner = await f.login(),
    stranger = await f.login(),
    path = f.channel(owner),
    insert = f.sql.prepare(
      "INSERT INTO content_assets(id,wallet,kind,object_key,bytes,width,height,ready,created_at) VALUES(?,?,'post-image',?,524288,10,10,1,?)",
    );
  for (let i = 0; i < 40; i++) {
    const id = random();
    insert.run(id, owner.address, id, now());
  }
  const id = random();
  assert.throws(
    () => insert.run(id, owner.address, id, now()),
    /CONTENT_OWNER_FULL/,
  );
  const foreign = await f.upload(stranger);
  assert.throws(
    () =>
      f.sql
        .prepare(
          "INSERT INTO channel_posts(channel_wallet,wallet,client_id,text,image_id,created_at) VALUES(?,?,?,'',?,?)",
        )
        .run(owner.address, owner.address, random(), foreign.id, now()),
    /CONTENT_ASSET_INVALID/,
  );
  assert.equal(
    (
      await f.call(
        path,
        { imageId: foreign.id, clientId: random() },
        owner.cookie,
      )
    ).status,
    400,
  );
});

test("channel feed pagination, rate limits and separate channels stay isolated", async () => {
  const f = fixture(),
    owner = await f.login(),
    other = await f.login(),
    path = f.channel(owner),
    otherPath = f.channel(other),
    insert = f.sql.prepare(
      "INSERT INTO channel_posts(channel_wallet,wallet,client_id,text,created_at) VALUES(?,?,?,?,?)",
    );
  for (let i = 0; i < 30; i++)
    insert.run(owner.address, owner.address, random(), "Post " + i, now());
  insert.run(other.address, other.address, random(), "Other channel", now());
  const first = (await (await f.call(path)).json()) as any;
  assert.equal(first.posts.length, 25);
  assert.equal(first.posts[0].text, "Post 29");
  insert.run(owner.address, owner.address, random(), "New arrival", now());
  const next = (await (
    await f.call(path + "?before=" + first.nextCursor)
  ).json()) as any;
  assert.equal(next.posts.length, 5);
  assert.equal(next.nextCursor, null);
  assert.equal(
    (
      await f.call(
        otherPath + "/" + first.posts[0].id + "/delete",
        {},
        other.cookie,
      )
    ).status,
    404,
  );
  assert.equal((await f.call(path + "?before=-1")).status, 400);
  let last: any;
  for (let i = 0; i < 5; i++) {
    last = { text: "Rate " + i, clientId: random() };
    assert.equal((await f.call(path, last, owner.cookie)).status, 201);
  }
  assert.equal((await f.call(path, last, owner.cookie)).status, 200);
  assert.equal(
    (await f.call(path, { text: "Too many", clientId: random() }, owner.cookie))
      .status,
    429,
  );
});

test("worker routes free media and channel posts with origin/authentication guards", async () => {
  const f = fixture(),
    owner = await f.login(),
    path = f.channel(owner);
  const execute = (
    route: string,
    body: string | Uint8Array | undefined,
    cookie = "",
    origin = f.env.PUBLIC_ORIGIN!,
  ) =>
    worker.fetch(
      new Request(f.env.PUBLIC_ORIGIN + "/api/creators" + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin,
          cookie,
          "content-type":
            body instanceof Uint8Array ? "image/jpeg" : "application/json",
        },
        body: body instanceof Uint8Array ? new Uint8Array(body).buffer : body,
      }),
      f.env,
      { waitUntil() {} },
    );
  assert.equal((await execute(path, undefined)).status, 200);
  assert.equal(
    (await execute(path, JSON.stringify({ text: "Hello", clientId: random() })))
      .status,
    401,
  );
  assert.equal(
    (
      await execute(
        path,
        JSON.stringify({ text: "Hello", clientId: random() }),
        owner.cookie,
        "https://evil.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await execute(
        "/content/media?kind=post-image",
        jpeg(),
        owner.cookie,
        "https://evil.test",
      )
    ).status,
    403,
  );
  assert.equal(
    (await execute("/content/media?kind=post-image", jpeg())).status,
    401,
  );
  assert.equal(
    (await execute("/content/media?kind=post-image", jpeg(), owner.cookie))
      .status,
    201,
  );
});

test("profile picker local URLs require their corresponding owned asset IDs", async () => {
  const f = fixture(),
    owner = await f.login(),
    path = f.community(owner),
    logo = await f.upload(owner, "community-logo"),
    banner = await f.upload(owner, "community-banner"),
    draft = {
      name: "Community",
      description: "",
      accent: "purple",
      logoUrl: logo.url,
      bannerUrl: banner.url,
      logoAssetId: logo.id,
      bannerAssetId: banner.id,
    };
  const saved = await f.call(path + "/profile", draft, owner.cookie);
  assert.equal(saved.status, 200);
  const c = ((await saved.json()) as any).community;
  assert.equal(c.logoUrl, logo.url);
  assert.equal(c.bannerUrl, banner.url);
  assert.equal(
    (
      await f.call(
        path + "/profile",
        { ...draft, logoUrl: "/api/creators/content/media/" + random() },
        owner.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        path + "/profile",
        { ...draft, logoAssetId: null },
        owner.cookie,
      )
    ).status,
    400,
  );
});

test("failed R2 writes retain a bounded reservation if cleanup also fails, then recover safely", async () => {
  const f = fixture(),
    owner = await f.login();
  f.env.CREATOR_MEDIA!.put = async (key, value) => {
    f.objects.set(key, new Uint8Array(value));
    throw new Error("R2 write response lost");
  };
  f.env.CREATOR_MEDIA!.delete = async () => {
    throw new Error("R2 unavailable");
  };
  await assert.rejects(
    () => f.call("/content/media?kind=post-image", jpeg(), owner.cookie),
    /R2 write response lost/,
  );
  const reserved = f.sql
    .prepare("SELECT id,ready,bytes FROM content_assets")
    .get();
  assert.equal(reserved.ready, 2);
  assert.equal(reserved.bytes, jpeg().length);
  assert.equal(
    (await f.call("/content/media/" + reserved.id, undefined, owner.cookie))
      .status,
    404,
  );
  f.env.CREATOR_MEDIA!.delete = async (key) => {
    f.objects.delete(key);
  };
  await cleanupContentMedia(f.env);
  assert.equal(f.objects.size, 0);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM content_assets").get().n,
    0,
  );
});

test("the global free-image storage cap includes pending reservations across wallets", async () => {
  const f = fixture(),
    insert = f.sql.prepare(
      "INSERT INTO content_assets(id,wallet,kind,object_key,bytes,width,height,created_at) VALUES(?,?,'post-image',?,524288,10,10,?)",
    );
  let user = await f.login();
  for (let i = 0; i < 512; i++) {
    if (i && i % 40 === 0) user = await f.login();
    const id = random();
    insert.run(id, user.address, id, now());
  }
  const id = random();
  assert.throws(
    () => insert.run(id, user.address, id, now()),
    /CONTENT_STORAGE_FULL/,
  );
  assert.equal(
    f.sql.prepare("SELECT sum(bytes) AS bytes FROM content_assets").get().bytes,
    268435456,
  );
});
