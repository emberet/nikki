import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
  sql.exec(
    readFileSync(
      new URL(
        "../creator-worker/migrations/0001_creators.sql",
        import.meta.url,
      ),
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
