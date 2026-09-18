import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";
import {
  AccountLayout,
  AccountState,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  decodeCloseAccountInstruction,
} from "@solana/spl-token";
import {
  coinCreatorVaultAuthorityPda,
  coinCreatorVaultAtaPda,
  PUMP_AMM_PROGRAM_ID,
} from "@pump-fun/pump-swap-sdk";
import worker from "../creator-worker/index";
import { hash, now } from "../creator-worker/common";
import {
  confirmIntent,
  holdings,
  nativeFeeInstructions,
  prepareIntent,
  submitIntent,
} from "../creator-worker/chain";
import type { Env, CreatorToken } from "../creator-worker/types";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const migration of readdirSync(
    new URL("../creator-worker/migrations/", import.meta.url),
  )
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    sql.exec(
      readFileSync(
        new URL("../creator-worker/migrations/" + migration, import.meta.url),
        "utf8",
      ),
    );
  }
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
  const db = {
    prepare: (query: string) => new Statement(query),
    async batch(statements: Statement[]) {
      sql.exec("BEGIN");
      try {
        const rows = await Promise.all(statements.map((s) => s.run()));
        sql.exec("COMMIT");
        return rows;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const env: Env = {
    CREATORS_DB: db as any,
    PUBLIC_ORIGIN: "https://nikki.test",
    TOKEN_LAUNCH_ENABLED: "true",
    ASSETS: {
      async fetch(req) {
        return new Response(new URL(req.url).pathname);
      },
    },
  };
  async function call(
    route: string,
    data?: any,
    cookie = "",
    extra: Record<string, string> = {},
  ) {
    return worker.fetch(
      new Request(env.PUBLIC_ORIGIN + "/api/creators" + route, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          origin: env.PUBLIC_ORIGIN!,
          "content-type": "application/json",
          cookie,
          ...extra,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      env,
      { waitUntil: () => {} },
    );
  }
  async function login(key = Keypair.generate()) {
    const challenge = await call("/auth/challenge", {
      wallet: key.publicKey.toBase58(),
    });
    assert.equal(challenge.status, 200);
    const payload: any = await challenge.json();
    const cookie = challenge.headers.get("set-cookie")!.split(";")[0];
    const signed = {
      id: payload.id,
      signature: bs58.encode(
        nacl.sign.detached(
          new TextEncoder().encode(payload.message),
          key.secretKey,
        ),
      ),
    };
    const verified = await call("/auth/verify", signed, cookie);
    assert.equal(verified.status, 200);
    return {
      key,
      address: key.publicKey.toBase58(),
      cookie: verified.headers.get("set-cookie")!.split(";")[0],
      challengeCookie: cookie,
      signed,
    };
  }
  return { sql, env, call, login };
}
const profile = {
  handle: "historian",
  displayName: "History",
  bio: "A living record",
  category: "History",
  accent: "lime",
  published: false,
};

test("creator wallet login binds signatures to browser, wallet, expiry and a one-use challenge", async () => {
  const f = fixture();
  const user = await f.login();
  assert.equal(
    (await f.call("/auth/verify", user.signed, user.challengeCookie)).status,
    403,
  );
  const key = Keypair.generate();
  const c = await f.call("/auth/challenge", {
    wallet: key.publicKey.toBase58(),
  });
  const challenge: any = await c.json();
  const signed = {
    id: challenge.id,
    signature: bs58.encode(
      nacl.sign.detached(
        new TextEncoder().encode(challenge.message),
        key.secretKey,
      ),
    ),
  };
  assert.equal((await f.call("/auth/verify", signed)).status, 403);
  const cookie = c.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (
      await f.call(
        "/auth/verify",
        { ...signed, signature: user.signed.signature },
        cookie,
      )
    ).status,
    403,
  );
  f.sql
    .prepare("UPDATE creator_challenges SET expires_at=0 WHERE id=?")
    .run(challenge.id);
  assert.equal((await f.call("/auth/verify", signed, cookie)).status, 403);
  assert.equal(
    (
      await f.call("/auth/challenge", { wallet: user.address }, "", {
        origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  await f.call("/auth/logout", {}, user.cookie);
  assert.equal((await f.call("/profile", profile, user.cookie)).status, 401);
});

test("channels require X to publish; private drafts, ownership and permanent handles are enforced", async () => {
  const f = fixture(),
    a = await f.login(),
    b = await f.login();
  assert.equal((await f.call("/profile", profile, a.cookie)).status, 200);
  assert.equal(
    (await f.call("/profile", { ...profile, published: true }, a.cookie))
      .status,
    409,
  );
  assert.equal((await f.call("/channels/historian")).status, 404);
  f.sql
    .prepare(
      "UPDATE creator_users SET x_id='123',x_username='history' WHERE wallet=?",
    )
    .run(a.address);
  assert.equal(
    (
      await f.call(
        "/profile",
        { ...profile, published: true, wallet: b.address },
        a.cookie,
      )
    ).status,
    200,
  );
  assert.equal((await f.call("/profile", profile, b.cookie)).status, 409);
  assert.equal(
    (await f.call("/profile", { ...profile, handle: "renamed" }, a.cookie))
      .status,
    409,
  );
  const publicProfile: any = await (await f.call("/channels/historian")).json();
  assert.equal(publicProfile.channel.wallet, a.address);
  const search: any = await (
    await f.call("/channels?q=%25%27%20OR%201%3D1")
  ).json();
  assert.deepEqual(search.channels, []);
  const token = {
    mint: Keypair.generate().publicKey.toBase58(),
    name: "😀".repeat(12),
    symbol: "HIST",
    description: "History",
  };
  assert.equal((await f.call("/token/draft", token, a.cookie)).status, 400);
  assert.equal(
    (await f.call("/token/draft", { ...token, name: "History" }, a.cookie))
      .status,
    200,
  );
  assert.equal(
    (
      await f.call(
        "/token/draft",
        {
          ...token,
          mint: Keypair.generate().publicKey.toBase58(),
          name: "History",
        },
        a.cookie,
      )
    ).status,
    409,
  );
});

test("X callback is PKCE/session bound, one-use, and cannot replace an existing identity", async (t) => {
  const f = fixture(),
    a = await f.login(),
    b = await f.login();
  Object.assign(f.env, {
    X_CLIENT_ID: "test-client",
    X_CLIENT_SECRET: "test-secret",
  });
  const start = await f.call("/auth/x/start", undefined, a.cookie);
  const url = new URL(start.headers.get("location")!);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://nikki.test/api/creators/auth/x/callback",
  );
  const callback =
    "/auth/x/callback?state=" + url.searchParams.get("state") + "&code=test";
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return Response.json(
      count === 1
        ? { access_token: "test-access-token" }
        : { data: { id: "123", username: "history" } },
    );
  });
  assert.equal((await f.call(callback, undefined, b.cookie)).status, 400);
  assert.equal(count, 0);
  assert.equal((await f.call(callback, undefined, a.cookie)).status, 302);
  assert.equal((await f.call(callback, undefined, a.cookie)).status, 400);
  const second = await f.call("/auth/x/start", undefined, a.cookie);
  const secondState = new URL(second.headers.get("location")!).searchParams.get(
    "state",
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async (input: unknown) =>
    Response.json(
      String(input).includes("oauth2/token")
        ? { access_token: "test-access-token" }
        : { data: { id: "456", username: "imposter" } },
    ),
  );
  assert.equal(
    (
      await f.call(
        "/auth/x/callback?state=" + secondState + "&code=test",
        undefined,
        a.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    f.sql
      .prepare("SELECT x_id FROM creator_users WHERE wallet=?")
      .get(a.address).x_id,
    "123",
  );
});

test("holder subscriptions sum exact raw balances across SPL and Token-2022 accounts", async (t) => {
  const f = fixture(),
    user = await f.login();
  let count = 0;
  t.mock.method(
    Connection.prototype,
    "getParsedTokenAccountsByOwner",
    async () =>
      ({
        context: { slot: 1 },
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    owner: user.address,
                    mint: "fixture-mint",
                    tokenAmount: {
                      amount: count++ === 0 ? "9007199254740993" : "7",
                    },
                  },
                },
              },
            },
          },
        ],
      }) as any,
  );
  assert.equal(
    (await holdings(f.env, user.address)).get("fixture-mint"),
    9007199254741000n,
  );
});

async function transactionFixture() {
  const f = fixture(),
    user = await f.login(),
    mint = Keypair.generate();
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: user.key.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: user.key.publicKey,
          toPubkey: mint.publicKey,
          lamports: 1,
        }),
      ],
    }).compileToV0Message(),
  );
  const token: CreatorToken = {
    mint: mint.publicKey.toBase58(),
    wallet: user.address,
    name: "History",
    symbol: "HIST",
    description: "Record",
    accent: "lime",
    x_username: "history",
    metadata_uri: "https://nikki.test/metadata",
    status: "draft",
    created_at: now(),
    verified_at: null,
    launch_signature: null,
  };
  f.sql
    .prepare(
      "INSERT INTO creator_tokens(mint,wallet,name,symbol,description,accent,x_username,metadata_uri,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      token.mint,
      user.address,
      token.name,
      token.symbol,
      token.description,
      token.accent,
      token.x_username,
      token.metadata_uri,
      now(),
    );
  const id = "a".repeat(64),
    unsigned = Buffer.from(tx.serialize()).toString("base64");
  f.sql
    .prepare(
      "INSERT INTO creator_intents(id,wallet,kind,mint,message_hash,unsigned_tx,blockhash,last_valid_height,estimated_lamports,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      user.address,
      "launch",
      token.mint,
      await hash(tx.message.serialize()),
      unsigned,
      tx.message.recentBlockhash,
      100,
      "5000",
      now(),
    );
  return { ...f, user, token, tx, id, unsigned };
}
test("submitting preserves known signatures and rejects altered messages, missing signatures and other wallets", async (t) => {
  const f = await transactionFixture();
  await assert.rejects(
    submitIntent(f.env, f.user.address, f.id, f.unsigned),
    /signature/,
  );
  f.tx.sign([f.user.key]);
  const signed = Buffer.from(f.tx.serialize()).toString("base64");
  await assert.rejects(
    submitIntent(f.env, Keypair.generate().publicKey.toBase58(), f.id, signed),
    /not found/,
  );
  t.mock.method(Connection.prototype, "getSignatureStatuses", async () => ({
    context: { slot: 1 },
    value: [
      {
        slot: 1,
        confirmations: null,
        err: null,
        confirmationStatus: "finalized",
      },
    ],
  }));
  const result = await submitIntent(f.env, f.user.address, f.id, signed);
  assert.equal(
    f.sql.prepare("SELECT signature FROM creator_intents WHERE id=?").get(f.id)
      .signature,
    result.signature,
  );
  f.tx.message.recentBlockhash = Keypair.generate().publicKey.toBase58();
  f.tx.sign([f.user.key]);
  await assert.rejects(
    submitIntent(
      f.env,
      f.user.address,
      f.id,
      Buffer.from(f.tx.serialize()).toString("base64"),
    ),
    /changed/,
  );
});
test("unexpired launch retries resume one intent; unknown expired launches resolve without duplicate signing", async (t) => {
  const f = await transactionFixture();
  t.mock.method(
    Connection.prototype,
    "getGenesisHash",
    async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  );
  let height = 90;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
    const request = JSON.parse(init.body);
    assert.equal(request.method, "getBlockHeight");
    return Response.json({ jsonrpc: "2.0", id: request.id, result: height });
  });
  t.mock.method(Connection.prototype, "getAccountInfo", async () => null);
  const resumed = await prepareIntent(f.env, f.user.address, f.token, "launch");
  assert.equal(resumed.id, f.id);
  assert.equal(resumed.transaction, f.unsigned);
  assert.equal((await f.call("/token/abandon", {}, f.user.cookie)).status, 409);
  height = 101;
  assert.equal(
    (await confirmIntent(f.env, f.user.address, f.id)).status,
    "expired",
  );
  assert.equal((await f.call("/token/abandon", {}, f.user.cookie)).status, 200);
  assert.equal(
    f.sql
      .prepare("SELECT status FROM creator_tokens WHERE mint=?")
      .get(f.token.mint).status,
    "abandoned",
  );
});
test("atomic launch preparation cannot resurrect a concurrently abandoned draft", async (t) => {
  const f = await transactionFixture();
  f.sql.exec("DELETE FROM creator_intents");
  t.mock.method(
    Connection.prototype,
    "getGenesisHash",
    async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  );
  t.mock.method(Connection.prototype, "getAccountInfo", async () => null);
  t.mock.method(Connection.prototype, "getLatestBlockhash", async () => ({
    blockhash: f.tx.message.recentBlockhash,
    lastValidBlockHeight: 100,
  }));
  t.mock.method(Connection.prototype, "getBalance", async () => 1000000000);
  t.mock.method(Connection.prototype, "getFeeForMessage", async () => ({
    context: { slot: 1 },
    value: 5000,
  }));
  t.mock.method(Connection.prototype, "simulateTransaction", async () => {
    f.sql
      .prepare("UPDATE creator_tokens SET status='abandoned' WHERE mint=?")
      .run(f.token.mint);
    return {
      context: { slot: 1 },
      value: { err: null, logs: [], accounts: [{ lamports: 999000000 }] },
    } as any;
  });
  await assert.rejects(
    prepareIntent(f.env, f.user.address, f.token, "launch"),
    /changed this draft/,
  );
  assert.equal(
    f.sql.prepare("SELECT COUNT(*) AS n FROM creator_intents").get().n,
    0,
  );
});
test("native Pump fee collection uses the SOL vault and skips missing AMM vaults", async (t) => {
  t.mock.method(
    OnlinePumpSdk.prototype,
    "getCreatorVaultBalance",
    async () => ({ isZero: () => false }) as any,
  );
  t.mock.method(Connection.prototype, "getMultipleAccountsInfo", async () => [
    null,
    null,
  ]);
  const instructions = await nativeFeeInstructions(
    new Connection("https://rpc.test"),
    Keypair.generate().publicKey,
  );
  assert.equal(instructions.length, 1);
  assert.ok(instructions[0].programId.equals(PUMP_PROGRAM_ID));
  assert.deepEqual(
    [...instructions[0].data.slice(0, 8)],
    [20, 22, 86, 123, 198, 28, 219, 132],
  );
  assert.equal(instructions[0].keys.length, 5);
});
test("AMM-only fees create only the recipient account and unwrap to the creator", async (t) => {
  const creator = Keypair.generate().publicKey,
    owner = coinCreatorVaultAuthorityPda(creator),
    vaultAddress = coinCreatorVaultAtaPda(owner, NATIVE_MINT, TOKEN_PROGRAM_ID),
    recipient = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      creator,
      true,
      TOKEN_PROGRAM_ID,
    );
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    {
      mint: NATIVE_MINT,
      owner,
      amount: 1_000_000n,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: AccountState.Initialized,
      isNativeOption: 1,
      isNative: 2_039_280n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  const vault = {
      data,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
      lamports: 3_039_280,
      rentEpoch: 0,
    },
    c = new Connection("https://rpc.test");
  t.mock.method(c, "getAccountInfo", async () => null);
  t.mock.method(c, "getMultipleAccountsInfo", async (keys: PublicKey[]) =>
    keys.map((key) => {
      if (key.equals(vaultAddress)) return vault;
      assert.ok(key.equals(recipient));
      return null;
    }),
  );
  const instructions = await nativeFeeInstructions(c, creator);
  assert.equal(instructions.length, 3);
  assert.ok(instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
  assert.ok(instructions[0].keys[1].pubkey.equals(recipient));
  assert.ok(instructions[1].programId.equals(PUMP_AMM_PROGRAM_ID));
  const close = decodeCloseAccountInstruction(instructions[2]);
  assert.ok(close.keys.account.pubkey.equals(recipient));
  assert.ok(close.keys.destination.pubkey.equals(creator));
  assert.ok(close.keys.authority.pubkey.equals(creator));
});
test("absent fee vaults produce no fee collection instructions", async (t) => {
  const c = new Connection("https://rpc.test");
  t.mock.method(c, "getAccountInfo", async () => null);
  t.mock.method(c, "getMultipleAccountsInfo", async (keys: PublicKey[]) =>
    keys.map(() => null),
  );
  assert.deepEqual(
    await nativeFeeInstructions(c, Keypair.generate().publicKey),
    [],
  );
});
test("creator URLs return 404 for missing channels and retain published handles without redirecting", async () => {
  const f = fixture();
  const req = new Request("https://nikki.test/c/historian/");
  const context = { waitUntil: () => {} };
  assert.equal((await worker.fetch(req, f.env, context)).status, 404);
  const user = await f.login();
  f.sql
    .prepare(
      "UPDATE creator_users SET x_id='123',x_username='history' WHERE wallet=?",
    )
    .run(user.address);
  await f.call("/profile", { ...profile, published: true }, user.cookie);
  const response = await worker.fetch(req, f.env, context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(await response.text(), "/c/");
});

test("release support and founder operations keep requests private and audit replies", async () => {
  const f = fixture(),
    a = await f.login(),
    b = await f.login(),
    owner = await f.login();
  f.env.FOUNDER_WALLET = owner.address;
  assert.equal(
    (await f.call("/ops/overview", undefined, a.cookie)).status,
    403,
  );
  assert.equal((await f.call("/support")).status, 401);
  assert.equal(
    (
      await f.call(
        "/support",
        {
          category: "Other",
          message: "Please help with my creator account.",
          handle: "",
        },
        a.cookie,
        { origin: "https://evil.test" },
      )
    ).status,
    403,
  );
  const created = await f.call(
    "/support",
    {
      category: "Account help",
      message: "<script>alert(1)</script> Help with my account.",
      handle: "",
    },
    a.cookie,
  );
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as any;
  assert.equal(
    ((await (await f.call("/support", undefined, b.cookie)).json()) as any)
      .tickets.length,
    0,
  );
  assert.equal(
    (
      await f.call(
        "/ops/ticket",
        { id, status: "resolved", reply: "Try reconnecting your wallet." },
        a.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        "/ops/ticket",
        { id, status: "resolved", reply: "Try reconnecting your wallet." },
        owner.cookie,
      )
    ).status,
    200,
  );
  const own = await f.call("/support", undefined, a.cookie);
  assert.equal(own.headers.get("cache-control"), "no-store");
  const ticket = ((await own.json()) as any).tickets[0];
  assert.equal(ticket.status, "resolved");
  assert.equal(ticket.reply, "Try reconnecting your wallet.");
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM creator_ops_audit").get().n,
    1,
  );
  assert.equal(
    (await f.call("/ops/flags", { paused: true }, owner.cookie)).status,
    200,
  );
  assert.equal(
    f.sql.prepare("SELECT transactions_paused FROM creator_flags").get()
      .transactions_paused,
    1,
  );
  assert.equal(
    (
      await f.call(
        "/transaction/submit",
        { id: "a".repeat(64), transaction: "bad" },
        a.cookie,
      )
    ).status,
    503,
  );
});

test("video library uses real archive IDs, isolates wallets, and preserves progress when saving", async () => {
  const f = fixture(),
    a = await f.login(),
    b = await f.login(),
    id = "a".repeat(43);
  f.env.ASSETS.fetch = async () =>
    Response.json({ records: [{ arweaveTx: id }] });
  assert.equal(
    (
      await f.call(
        "/library",
        { recordId: "z".repeat(43), saved: true },
        a.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.call("/library", { recordId: id, position: -1 }, a.cookie)).status,
    400,
  );
  assert.equal(
    (await f.call("/library", { recordId: id, position: 123.5 }, a.cookie))
      .status,
    200,
  );
  assert.equal(
    (await f.call("/library", { recordId: id, saved: true }, a.cookie)).status,
    200,
  );
  const response = await f.call("/library", undefined, a.cookie);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const item = ((await response.json()) as any).items[0];
  assert.equal(item.position, 123.5);
  assert.equal(item.saved, 1);
  assert.deepEqual(
    ((await (await f.call("/library", undefined, b.cookie)).json()) as any)
      .items,
    [],
  );
  assert.equal(
    (
      await f.call(
        "/library",
        { recordId: id, saved: false, position: 0 },
        a.cookie,
      )
    ).status,
    200,
  );
  assert.deepEqual(
    ((await (await f.call("/library", undefined, a.cookie)).json()) as any)
      .items,
    [],
  );
});

test("channel media rejects invalid uploads and serves draft artwork only to its owner", async () => {
  const f = fixture(),
    a = await f.login(),
    b = await f.login();
  await f.call("/profile", profile, a.cookie);
  const objects = new Map<string, Uint8Array>();
  f.env.CREATOR_MEDIA = {
    async put(key, value) {
      objects.set(key, new Uint8Array(value as Uint8Array));
    },
    async get(key) {
      const bytes = objects.get(key);
      return bytes
        ? {
            body: new Response(new Uint8Array(bytes)).body!,
            httpEtag: '"test"',
          }
        : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  f.sql
    .prepare("UPDATE creator_users SET x_id=?,x_username=? WHERE wallet=?")
    .run("123", "historian", a.address);
  const jpeg = new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 100, 0, 100, 1, 1, 17, 0, 255, 217,
  ]);
  async function upload(
    bytes: Uint8Array,
    cookie = a.cookie,
    type = "image/jpeg",
  ) {
    return worker.fetch(
      new Request(f.env.PUBLIC_ORIGIN + "/api/creators/profile/media/avatar", {
        method: "POST",
        headers: { origin: f.env.PUBLIC_ORIGIN!, "content-type": type, cookie },
        body: new Uint8Array(bytes),
      }),
      f.env,
      { waitUntil: () => {} },
    );
  }
  assert.equal((await upload(jpeg, "")).status, 401);
  assert.equal((await upload(jpeg, a.cookie, "image/svg+xml")).status, 415);
  assert.equal((await upload(new Uint8Array(131073))).status, 413);
  assert.equal((await upload(new Uint8Array([1, 2, 3]))).status, 415);
  const r = await upload(jpeg);
  assert.equal(r.status, 200);
  const { id } = (await r.json()) as any;
  assert.equal((await f.call("/media/" + id)).status, 404);
  assert.equal((await f.call("/media/" + id, undefined, b.cookie)).status, 404);
  const own = await f.call("/media/" + id, undefined, a.cookie);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("cache-control"), "no-store");
  assert.equal(own.headers.get("content-type"), "image/jpeg");
  f.sql
    .prepare("UPDATE creator_users SET x_id=?,x_username=? WHERE wallet=?")
    .run("123", "historian", a.address);
  await f.call("/profile", { ...profile, published: true }, a.cookie);
  assert.equal((await f.call("/media/" + id)).status, 200);
  await f.call("/profile/media/avatar", { remove: true }, b.cookie);
  assert.equal((await f.call("/media/" + id)).status, 200);
  await f.call("/profile/media/avatar", { remove: true }, a.cookie);
  assert.equal((await f.call("/media/" + id)).status, 404);
});

test("creator search accepts long literal queries and transaction history never returns signing payloads", async () => {
  const f = fixture(),
    a = await f.login(),
    b = await f.login();
  assert.equal(
    (await f.call("/channels?q=" + encodeURIComponent("史".repeat(100))))
      .status,
    200,
  );
  const id = "a".repeat(64);
  f.sql
    .prepare(
      "INSERT INTO creator_intents(id,wallet,kind,mint,message_hash,unsigned_tx,blockhash,last_valid_height,estimated_lamports,created_at,signature,signed_tx,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      a.address,
      "launch",
      a.address,
      "private-hash",
      "unsigned-secret",
      "hash",
      1,
      "10",
      now(),
      "sig",
      "signed-secret",
      "failed",
    );
  const history = await f.call("/transactions", undefined, a.cookie);
  assert.equal(history.headers.get("cache-control"), "no-store");
  const body = await history.text();
  assert.ok(body.includes(id));
  assert.ok(!body.includes("secret"));
  assert.ok(!body.includes("message_hash"));
  assert.ok(!body.includes("unsigned_tx"));
  assert.equal(
    ((await (await f.call("/transactions", undefined, b.cookie)).json()) as any)
      .transactions.length,
    0,
  );
  assert.equal(
    (await f.call("/transactions?offset=-1", undefined, a.cookie)).status,
    400,
  );
});

test("storage caps are atomic and allow replacing library state at capacity", async () => {
  const f = fixture(),
    a = await f.login();
  const insert = f.sql.prepare(
    "INSERT INTO creator_library(wallet,record_id,updated_at) VALUES(?,?,?)",
  );
  for (let i = 0; i < 500; i++)
    insert.run(a.address, String(i).padStart(43, "a"), now());
  assert.throws(
    () => insert.run(a.address, "z".repeat(43), now()),
    /LIBRARY_FULL/,
  );
  assert.doesNotThrow(() =>
    f.sql
      .prepare(
        "INSERT INTO creator_library(wallet,record_id,updated_at,saved) VALUES(?,?,?,1) ON CONFLICT(wallet,record_id) DO UPDATE SET saved=1",
      )
      .run(a.address, String(0).padStart(43, "a"), now()),
  );
  const art = f.sql.prepare(
    "INSERT INTO creator_assets(id,wallet,kind,object_key,bytes,width,height,created_at) VALUES(?,?,'banner',?,393216,1200,400,?)",
  );
  for (let i = 0; i < 5; i++) art.run(String(i), a.address, String(i), now());
  assert.throws(
    () => art.run("six", a.address, "six", now()),
    /ART_OWNER_FULL/,
  );
});

test("public cache keys discard tracking parameters and keep search and pagination distinct", async () => {
  const { publicCacheKey } = await import("../creator-worker/cache");
  const key = (query: string) =>
    publicCacheKey(new URL("https://nikki.test/api/creators/channels" + query))
      .url;
  assert.equal(
    key("?q=history&offset=00&utm_test=one"),
    key("?offset=0&q=history&random=two"),
  );
  assert.notEqual(key("?q=history"), key("?q=knowledge"));
  assert.notEqual(key("?offset=0"), key("?offset=25"));
});

test("founder admin lists and moderates channels, communities, and posts", async () => {
  const f = fixture(),
    creator = await f.login(),
    owner = await f.login();
  f.env.FOUNDER_WALLET = owner.address;
  f.sql
    .prepare(
      "UPDATE creator_users SET x_id='42',x_username='historyfan' WHERE wallet=?",
    )
    .run(creator.address);
  assert.equal(
    (await f.call("/profile", { ...profile, published: true }, creator.cookie))
      .status,
    200,
  );
  const mint = Keypair.generate().publicKey.toBase58();
  f.sql
    .prepare(
      "INSERT INTO communities(mint,owner_wallet,name,accent,token_name,token_symbol,import_role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      mint,
      creator.address,
      "Friends",
      "purple",
      "Nikki",
      "NIKKI",
      "community-led",
      1,
      1,
    );
  f.sql
    .prepare(
      "INSERT INTO community_posts(mint,wallet,client_id,text,state,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(mint, creator.address, "c1", "community hello", "visible", 2);
  f.sql
    .prepare(
      "INSERT INTO channel_posts(channel_wallet,wallet,client_id,text,state,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(creator.address, creator.address, "p1", "channel hello", "visible", 3);
  for (const denied of [
    await f.call("/ops/channels?q=", undefined, creator.cookie),
    await f.call(
      "/ops/channel",
      { wallet: creator.address, published: false },
      creator.cookie,
    ),
    await f.call("/ops/communities?q=", undefined, creator.cookie),
    await f.call("/ops/community", { mint, state: "hidden" }, creator.cookie),
    await f.call("/ops/posts", undefined, creator.cookie),
  ])
    assert.equal(denied.status, 403);
  const channels: any = await (
    await f.call("/ops/channels?q=historian", undefined, owner.cookie)
  ).json();
  assert.equal(channels.channels.length, 1);
  assert.equal(channels.channels[0].published, 1);
  assert.equal(
    (
      await f.call(
        "/ops/channel",
        { wallet: creator.address, published: false },
        owner.cookie,
      )
    ).status,
    200,
  );
  const hiddenChannel: any = await (
    await f.call("/channels?q=historian")
  ).json();
  assert.equal(hiddenChannel.channels.length, 0);
  assert.equal(
    (
      await f.call(
        "/ops/channel",
        { wallet: creator.address, published: true },
        owner.cookie,
      )
    ).status,
    200,
  );
  const communities: any = await (
    await f.call("/ops/communities?q=friends", undefined, owner.cookie)
  ).json();
  assert.equal(communities.communities.length, 1);
  assert.equal(communities.communities[0].state, "visible");
  assert.equal(
    (await f.call("/ops/community", { mint, state: "hidden" }, owner.cookie))
      .status,
    200,
  );
  const publicCommunities: any = await (await f.call("/communities")).json();
  assert.equal(publicCommunities.communities.length, 0);
  assert.equal(
    (await f.call("/communities/" + mint, undefined, creator.cookie)).status,
    200,
  );
  assert.equal((await f.call("/communities/" + mint)).status, 404);
  assert.equal(
    (await f.call("/communities/" + mint, undefined, owner.cookie)).status,
    200,
  );
  const posts: any = await (
    await f.call("/ops/posts", undefined, owner.cookie)
  ).json();
  assert.equal(posts.posts.length, 2);
  assert.equal(posts.posts[0].kind, "channel");
  assert.equal(posts.posts[0].ref, "historian");
  assert.equal(posts.posts[1].kind, "community");
  assert.equal(posts.posts[1].ref, mint);
  const audit = f.sql
    .prepare("SELECT action FROM creator_ops_audit ORDER BY created_at")
    .all()
    .map((row: any) => row.action);
  assert.ok(audit.includes("channel-publish"));
  assert.ok(audit.includes("community-state"));
  const overview: any = await (
    await f.call("/ops/overview", undefined, owner.cookie)
  ).json();
  assert.equal(overview.counts.hiddenCommunities, 1);
  assert.equal(overview.counts.users, 2);
});

test("moderators lists wallets holding at least 1% of NIKKI with live channel details", async () => {
  const f = fixture(),
    creator = await f.login(),
    small = Keypair.generate().publicKey.toBase58();
  f.sql
    .prepare(
      "UPDATE creator_users SET x_id='77',x_username='stewardess' WHERE wallet=?",
    )
    .run(creator.address);
  assert.equal(
    (await f.call("/profile", { ...profile, published: true }, creator.cookie))
      .status,
    200,
  );
  assert.equal(
    ((await (await f.call("/moderators")).json()) as any).enabled,
    false,
  );
  const mint = Keypair.generate().publicKey.toBase58();
  f.env.NIKKI_MINT = mint;
  const account = (owner: string, amount: string) => ({
    account: { data: { parsed: { info: { owner, tokenAmount: { amount } } } } },
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    return Response.json({
      jsonrpc: "2.0",
      id: 1,
      result:
        body.method === "getTokenSupply"
          ? { value: { amount: "1000" } }
          : [
              account(creator.address, "30"),
              account(creator.address, "20"),
              account(small, "5"),
            ],
    });
  }) as typeof fetch;
  try {
    const first: any = await (await f.call("/moderators")).json();
    assert.equal(first.enabled, true);
    assert.equal(first.moderators.length, 1);
    assert.equal(first.moderators[0].wallet, creator.address);
    assert.equal(first.moderators[0].percent, 5);
    assert.equal(first.moderators[0].handle, "historian");
    assert.equal(first.moderators[0].xUsername, "stewardess");
    f.sql
      .prepare(
        "UPDATE creator_profiles SET display_name='New History' WHERE wallet=?",
      )
      .run(creator.address);
    const second: any = await (await f.call("/moderators")).json();
    assert.equal(second.moderators[0].displayName, "New History");
  } finally {
    globalThis.fetch = realFetch;
  }
});
