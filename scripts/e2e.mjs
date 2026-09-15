// Isolated integration test. Uses generated wallets, a temporary database,
// local RPC fixtures, and no transactions, real credentials, or external uploads.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PrismaClient } from "@prisma/client";
const temp = mkdtempSync(path.join(tmpdir(), "nikki-integration-")),
  databaseUrl = "file:" + path.join(temp, "test.db");
writeFileSync(path.join(temp, "test.db"), "");
const base = "http://127.0.0.1:4901",
  mint = Keypair.generate().publicKey.toBase58(),
  treasury = Keypair.generate();
const creator = Keypair.generate(),
  voters = Array.from({ length: 6 }, () => Keypair.generate()),
  exact = Keypair.generate(),
  late = Keypair.generate();
const balances = [
  ...voters.map((k) => [k.publicKey.toBase58(), 15000000n]),
  [exact.publicKey.toBase58(), 10000000n],
  [treasury.publicKey.toBase58(), 100000000n],
  [late.publicKey.toBase58(), 800000000n],
];
let partial = false;
let rpcTransaction = null;
let burned = 0n;
const rpc = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const { method, id } = JSON.parse(body);
  const result =
    method === "getAccountInfo"
      ? {
          context: { slot: 100 },
          value: {
            owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            data: {
              parsed: {
                info: {
                  decimals: 6,
                  supply: ((1000000000n - burned) * 1000000n).toString(),
                },
              },
            },
          },
        }
      : method === "getProgramAccounts"
        ? {
            context: { slot: 101 },
            value: balances
              .slice(0, partial ? -1 : undefined)
              .map(([owner, amount], i) => ({
                pubkey: "token-account-" + i,
                account: {
                  data: {
                    parsed: {
                      info: {
                        mint,
                        owner,
                        tokenAmount: {
                          amount: (
                            (amount -
                              (owner === late.publicKey.toBase58()
                                ? burned
                                : 0n)) *
                            1000000n
                          ).toString(),
                          decimals: 6,
                        },
                      },
                    },
                  },
                },
              })),
          }
        : method === "getTransaction"
          ? rpcTransaction
          : null;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
});
await new Promise((r) => rpc.listen(0, "127.0.0.1", r));
const env = {
  ...process.env,
  RELEASE_MODE: "local",
  DATABASE_URL: databaseUrl,
  HELD_DIR: path.join(temp, "held"),
  SESSION_SECRET: "test-only-session-secret-".repeat(3),
  APP_URL: base,
  RPC_URL: "http://127.0.0.1:" + rpc.address().port,
  TOKEN_MINT: mint,
  VOTING_ENABLED: "true",
  TREASURY_WALLET_HASH: createHash("sha256")
    .update(treasury.publicKey.toBase58())
    .digest("hex"),
  PUBLISHING_ENABLED: "false",
  STORAGE_KEYPAIR_PATH: "",
  X_CLIENT_ID: "",
  X_CLIENT_SECRET: "",
};
const migration = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, encoding: "utf8" },
);
if (migration.status !== 0) {
  rpc.close();
  throw Error(migration.stdout + "\n" + migration.stderr);
}
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let logs = "";
let launcher;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "4901",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.on("data", (b) => {
  logs += b;
});
server.stderr.on("data", (b) => {
  logs += b;
});
class Session {
  cookie = "";
  async fetch(route, options = {}) {
    const r = await fetch(base + route, {
      ...options,
      headers: { Origin: base, ...options.headers, Cookie: this.cookie },
    });
    const cookie = r.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return r;
  }
  async post(route, body) {
    return this.fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async login(key) {
    const challenge = await (await this.fetch("/api/auth/nonce")).json();
    const oldCookie = this.cookie;
    const payload = {
      wallet: key.publicKey.toBase58(),
      signature: bs58.encode(
        nacl.sign.detached(
          new TextEncoder().encode(challenge.message),
          key.secretKey,
        ),
      ),
    };
    const r = await this.post("/api/auth/verify", payload);
    assert.equal(r.status, 200, await r.text());
    return { oldCookie, payload };
  }
}
let checks = 0;
function check(name) {
  checks++;
  console.log("✓ " + name);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/config")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    if (i === 99)
      throw Error("Test server failed to start. " + logs.slice(-3000));
  }
  const cs = new Session(),
    login = await cs.login(creator);
  check("wallet sign-in uses a real signed, expiring challenge");
  const replay = await fetch(base + "/api/auth/verify", {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      Cookie: login.oldCookie,
    },
    body: JSON.stringify(login.payload),
  });
  assert.equal(replay.status, 401);
  check("replaying an old signed challenge and cookie is rejected");
  const cross = await cs.fetch("/api/auth/logout", {
    method: "POST",
    headers: { Origin: "https://attacker.invalid" },
  });
  assert.equal(cross.status, 403);
  check("cross-origin writes are rejected");
  const sessions = [];
  for (const key of [...voters, exact, treasury]) {
    const s = new Session();
    await s.login(key);
    const index = sessions.length;
    await db.user.update({
      where: { wallet: key.publicKey.toBase58() },
      data: {
        xId: "test-x-" + index,
        xUsername: "test" + index,
        xLinkedAt: new Date(),
      },
    });
    sessions.push(s);
  }
  const lateSession = new Session();
  await lateSession.login(late);
  const big = await cs.post("/api/upload/init", {
    title: "Too large",
    mimeType: "video/mp4",
    sizeBytes: 1000000001,
  });
  assert.equal(big.status, 413);
  check("1 GB maximum is enforced by the server");
  const initial = await cs.post("/api/upload/init", {
    title: "Integration fixture",
    description: "A test-only container header.",
    mimeType: "video/mp4",
    sizeBytes: 2048,
  });
  assert.equal(initial.status, 200);
  const { videoId } = await initial.json();
  const fixture = Buffer.alloc(2048);
  fixture.writeUInt32BE(24, 0);
  fixture.write("ftypisom", 4);
  let r = await cs.fetch(
    "/api/upload/chunk?videoId=" + videoId + "&offset=-1",
    { method: "POST", body: fixture },
  );
  assert.equal(r.status, 400);
  const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  await db.video.update({
    where: { id: videoId },
    data: { uploadLock: exited.pid + ":abandoned" },
  });
  r = await cs.fetch("/api/upload/chunk?videoId=" + videoId + "&offset=0", {
    method: "POST",
    body: fixture,
  });
  assert.equal(r.status, 200);
  check("an upload lock left by an exited process is recovered");
  r = await cs.fetch("/api/upload/chunk?videoId=" + videoId + "&offset=0", {
    method: "POST",
    body: fixture,
  });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).expected, 2048);
  check("chunk offsets reject negative values and duplicate appends");
  r = await cs.post("/api/upload/complete", { videoId });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "snapshot_pending");
  assert.equal(await db.payment.count({ where: { videoId } }), 0);
  check("upload completion creates no payment or premature publication");
  r = await cs.post("/api/pay/quote", { videoId });
  assert.equal(r.status, 409);
  check("payment is blocked before approval");
  partial = true;
  r = await cs.post("/api/voting/open", { videoId });
  assert.equal(r.status, 503);
  assert.equal(
    (await db.video.findUnique({ where: { id: videoId } })).status,
    "snapshot_pending",
  );
  partial = false;
  check("incomplete token snapshots cannot open an election");
  r = await cs.post("/api/voting/open", { videoId });
  assert.equal(r.status, 200, await r.text());
  const election = await db.video.findUnique({
    where: { id: videoId },
    include: { eligibleVoters: true },
  });
  assert.equal(election.voteClosesAt - election.voteOpensAt, 86400000);
  assert.equal(election.eligibleVoters.length, 6);
  check(
    "a finalized snapshot opens exactly 24 hours of voting and excludes the treasury and exact-threshold wallets",
  );
  r = await sessions[6].post("/api/voting/message", { videoId, choice: "yes" });
  assert.equal(r.status, 403);
  r = await sessions[7].post("/api/voting/message", { videoId, choice: "yes" });
  assert.equal(r.status, 403);
  await db.user.update({
    where: { wallet: late.publicKey.toBase58() },
    data: { xId: "late", xUsername: "late", xLinkedAt: new Date() },
  });
  r = await lateSession.post("/api/voting/message", { videoId, choice: "yes" });
  assert.equal(r.status, 403);
  check("linking X after opening does not change snapshot eligibility");
  r = await fetch(base + "/api/mod/preview/" + videoId);
  assert.equal(r.status, 401);
  r = await sessions[0].fetch("/api/mod/preview/" + videoId, {
    headers: { Range: "bytes=0-15" },
  });
  assert.equal(r.status, 206);
  assert.equal((await r.arrayBuffer()).byteLength, 16);
  r = await sessions[0].fetch("/api/mod/preview/" + videoId, {
    headers: { Range: "bytes=99999-" },
  });
  assert.equal(r.status, 416);
  check("private video preview enforces access and valid ranges");
  async function cast(index, choice) {
    const prep = await sessions[index].post("/api/voting/message", {
      videoId,
      choice,
      reason: "Test decision",
    });
    assert.equal(prep.status, 200);
    const ballot = await prep.json();
    const sig = bs58.encode(
      nacl.sign.detached(
        new TextEncoder().encode(ballot.message),
        voters[index].secretKey,
      ),
    );
    const result = await sessions[index].post("/api/voting/ballot", {
      videoId,
      choice,
      reason: "Test decision",
      signature: sig,
      issuedAt: ballot.issuedAt,
    });
    assert.equal(result.status, 200, await result.text());
  }
  await cast(0, "no");
  await new Promise((r) => setTimeout(r, 10));
  await cast(0, "yes");
  assert.equal(await db.ballot.count({ where: { videoId } }), 1);
  check("changing a signed vote does not create another voting identity");
  for (let i = 1; i < 4; i++) await cast(i, "yes");
  await cast(4, "no");
  await cs.fetch("/api/my-videos");
  assert.equal(
    (await db.video.findUnique({ where: { id: videoId } })).status,
    "voting",
  );
  check("80 percent approval cannot publish before closing");
  await db.video.update({
    where: { id: videoId },
    data: { voteClosesAt: new Date(Date.now() - 1000) },
  });
  r = await cs.fetch("/api/my-videos");
  assert.equal(r.status, 200);
  const final = await db.video.findUnique({ where: { id: videoId } });
  assert.equal(final.status, "approved");
  assert.equal(final.yesCount, 4);
  assert.equal(final.noCount, 1);
  r = await sessions[5].post("/api/voting/message", { videoId, choice: "yes" });
  assert.equal(r.status, 409);
  check("closing finalizes 4 yes / 1 no as approved and rejects late votes");
  r = await fetch(base + "/api/feed");
  assert.deepEqual(await r.json(), []);
  check("approved but unpreserved videos stay out of the public archive");
  r = await cs.post("/api/pay/quote", { videoId });
  assert.equal(r.status, 503);
  check("missing storage configuration cannot collect funds");
  r = await cs.post("/api/mod/review", { videoId, decision: "approved" });
  assert.equal(r.status, 410);
  check("legacy single-moderator publication is disabled");
  // Payment recovery uses immutable quote history while new publishing is paused.
  const recipient = Keypair.generate().publicKey.toBase58(),
    oldStart = new Date(Date.now() - 3600000),
    oldEnd = new Date(oldStart.getTime() + 900000),
    currentStart = new Date();
  const oldReference = "nikki:" + videoId + ":old",
    newReference = "nikki:" + videoId + ":new";
  const oldQuote = {
    videoId,
    reference: oldReference,
    quoteLamports: 12345n,
    recipient,
    fileSha256: final.sha256,
    createdAt: oldStart,
    expiresAt: oldEnd,
  };
  await db.storageQuote.create({ data: oldQuote });
  await db.storageQuote.create({
    data: {
      ...oldQuote,
      reference: newReference,
      quoteLamports: 54321n,
      createdAt: currentStart,
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  await db.payment.create({
    data: {
      videoId,
      currency: "SOL",
      amountLamports: 0n,
      quoteLamports: 54321n,
      payerWallet: creator.publicKey.toBase58(),
      reference: newReference,
      recipient,
      fileSha256: final.sha256,
      createdAt: currentStart,
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const signature = bs58.encode(
    nacl.sign.detached(
      new TextEncoder().encode("test payment fixture"),
      creator.secretKey,
    ),
  );
  rpcTransaction = {
    slot: 102,
    blockTime: Math.floor(oldStart.getTime() / 1000) + 60,
    version: "legacy",
    meta: {
      err: null,
      fee: 5000,
      preBalances: [100000, 0],
      postBalances: [82655, 12345],
    },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [
          {
            pubkey: creator.publicKey.toBase58(),
            signer: true,
            writable: true,
          },
          { pubkey: recipient, signer: false, writable: true },
        ],
        recentBlockhash: Keypair.generate().publicKey.toBase58(),
        instructions: [
          {
            programId: "11111111111111111111111111111111",
            program: "system",
            parsed: {
              type: "transfer",
              info: {
                source: creator.publicKey.toBase58(),
                destination: recipient,
                lamports: 12345,
              },
            },
          },
          {
            programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            program: "spl-memo",
            parsed: oldReference,
          },
        ],
      },
    },
  };
  r = await cs.post("/api/pay", {
    videoId,
    signature,
    currency: "SOL",
    confirmPermanent: true,
  });
  assert.equal(r.status, 200, await r.text());
  const recovered = await db.payment.findUnique({ where: { videoId } });
  assert.equal(recovered.reference, oldReference);
  assert.equal(recovered.amountLamports, 12345n);
  check(
    "an earlier paid quote remains recoverable after a refresh, even with purchasing paused",
  );
  r = await cs.post("/api/pay", {
    videoId,
    signature,
    currency: "SOL",
    confirmPermanent: true,
  });
  assert.equal(r.status, 200);
  assert.equal(await db.payment.count({ where: { videoId } }), 1);
  check("payment verification is idempotent and records the same payment once");
  r = await cs.post("/api/publish", { videoId });
  assert.equal(r.status, 503);
  check("paid records cannot bypass the live publishing gate");
  const burnedProposal = await db.video.create({
    data: {
      title: "Burned supply fixture",
      creatorId: final.creatorId,
      status: "snapshot_pending",
      sha256: "a".repeat(64),
    },
  });
  burned = 1000n;
  r = await cs.post("/api/voting/open", { videoId: burnedProposal.id });
  assert.equal(r.status, 200, await r.text());
  check("legitimate token burns preserve eligibility snapshot support");
  const noQuorum = await db.video.create({
    data: {
      title: "No quorum",
      creatorId: final.creatorId,
      status: "voting",
      voteOpensAt: new Date(Date.now() - 86400001),
      voteClosesAt: new Date(Date.now() - 1),
    },
  });
  await cs.fetch("/api/my-videos");
  assert.equal(
    (await db.video.findUnique({ where: { id: noQuorum.id } })).status,
    "expired",
  );
  check("no quorum closes unapproved without a payment");
  mkdirSync(path.join(temp, "held"), { recursive: true });
  const stalePath = path.join(temp, "held", "stale.bin");
  writeFileSync(stalePath, fixture);
  const stale = await db.video.create({
    data: {
      title: "Expired temporary fixture",
      finalizedAt: new Date(Date.now() - 8 * 86400000),
      creatorId: final.creatorId,
      status: "rejected",
      filePath: stalePath,
      sizeBytes: 2048n,
      expectedBytes: 2048n,
      createdAt: new Date(Date.now() - 8 * 86400000),
    },
  });
  await db.video.update({
    where: { id: videoId },
    data: { createdAt: new Date(Date.now() - 8 * 86400000) },
  });
  const freshPath = path.join(temp, "held", "fresh.bin"),
    publishedPath = path.join(temp, "held", "published-cache.bin");
  writeFileSync(freshPath, fixture);
  writeFileSync(publishedPath, fixture);
  const fresh = await db.video.create({
    data: {
      title: "Recently approved fixture",
      creatorId: final.creatorId,
      status: "approved",
      createdAt: new Date(Date.now() - 8 * 86400000),
      finalizedAt: new Date(),
      filePath: freshPath,
    },
  });
  const cached = await db.video.create({
    data: {
      title: "Verified cache fixture",
      creatorId: final.creatorId,
      status: "published",
      arweaveTx: "v".repeat(43),
      recordTx: "r".repeat(43),
      archiveJson: "{}",
      filePath: publishedPath,
    },
  });
  const worker = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/preservation-worker.ts", "--once"],
    { env, encoding: "utf8", timeout: 20000 },
  );
  assert.equal(worker.status, 0, worker.stderr);
  assert.equal(existsSync(stalePath), false);
  assert.equal(
    (await db.video.findUnique({ where: { id: stale.id } })).status,
    "expired_upload",
  );
  assert.equal(existsSync(final.filePath), true);
  assert.equal(
    (await db.video.findUnique({ where: { id: videoId } })).status,
    "payment_received",
  );
  check(
    "the background worker expires unpaid temporary files while preserving paid files",
  );
  assert.equal(existsSync(freshPath), true);
  assert.equal(
    (await db.video.findUnique({ where: { id: fresh.id } })).status,
    "approved",
  );
  check("newly approved submissions receive their own retention window");
  assert.equal(existsSync(publishedPath), false);
  assert.equal(
    (await db.video.findUnique({ where: { id: cached.id } })).filePath,
    null,
  );
  check(
    "verified published-cache cleanup is retried independently of payment state",
  );
  const queued = [];
  for (let i = 0; i < 6; i++)
    queued.push(
      await db.video.create({
        data: {
          title: "Fair queue fixture " + i,
          creatorId: final.creatorId,
          status: "publish_queued",
        },
      }),
    );
  const rotation = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "const {nextPreservationBatch}=require('./lib/preservation-queue.ts');const {db}=require('./lib/db.ts');(async()=>{const a=await nextPreservationBatch();const b=await nextPreservationBatch();console.log(JSON.stringify([a.map(v=>v.id),b.map(v=>v.id)]));await db.$disconnect()})()",
    ],
    { env, encoding: "utf8", timeout: 20000 },
  );
  assert.equal(rotation.status, 0, rotation.stderr);
  const batches = JSON.parse(rotation.stdout.trim());
  assert.equal(new Set(batches.flat()).size, 6);
  check("delayed preservation jobs cannot starve newer paid records");
  let launchLogs = "";
  launcher = spawn(process.execPath, ["scripts/start-production.mjs"], {
    env: { ...env, PORT: "4902" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  launcher.stdout.on("data", (b) => {
    launchLogs += b;
  });
  launcher.stderr.on("data", (b) => {
    launchLogs += b;
  });
  let launchReady = false;
  for (let i = 0; i < 60; i++) {
    try {
      if (
        (await fetch("http://127.0.0.1:4902/api/config")).ok &&
        launchLogs.includes("preservation worker ready")
      ) {
        launchReady = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(launchReady, true, launchLogs);
  const stopped = new Promise((resolve) => launcher.once("exit", resolve));
  launcher.kill("SIGTERM");
  const stopTimeout = setTimeout(() => launcher.kill("SIGKILL"), 10000);
  const launchExit = await stopped;
  clearTimeout(stopTimeout);
  assert.equal(launchExit, 0);
  check(
    "the production launcher starts and gracefully stops both web and worker processes",
  );
  console.log(
    "\n" +
      checks +
      " integration checks passed. No live funds or storage used.",
  );
} catch (e) {
  console.error(e);
  console.error(logs.slice(-2500));
  process.exitCode = 1;
} finally {
  launcher?.kill("SIGTERM");
  server.kill("SIGTERM");
  rpc.close();
  await db.$disconnect();
}
