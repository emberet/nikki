// Backend e2e: sign-in (creator+mod), chunked upload, quote, simulated
// payment (DB flag — real SOL payment requires a funded wallet), mod queue,
// preview, reject path. Run: node scripts/e2e.mjs
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:4900";
const db = new PrismaClient();

function loadKp(f) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f, "utf8"))));
}

class Session {
  cookie = "";
  async fetch(path, opts = {}) {
    const r = await fetch(BASE + path, {
      ...opts,
      headers: { ...(opts.headers || {}), cookie: this.cookie },
    });
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return r;
  }
  async signIn(kp) {
    const { nonce } = await (await this.fetch("/api/auth/nonce")).json();
    const msg = new TextEncoder().encode(`Sign in to Nikki\nNonce: ${nonce}`);
    const sig = nacl.sign.detached(msg, kp.secretKey);
    const r = await this.fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: kp.publicKey.toBase58(), signature: bs58.encode(sig) }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("signin failed: " + JSON.stringify(j));
    return j;
  }
}

const assert = (cond, name) => {
  console.log(cond ? `  ✓ ${name}` : `  ✗ FAIL ${name}`);
  if (!cond) process.exitCode = 1;
};

const creator = loadKp("test-creator.json");
const mod = loadKp("test-mod.json");

// --- creator: sign in ---
const cs = new Session();
const cRes = await cs.signIn(creator);
assert(cRes.role === "creator", "creator signs in with role=creator");

// --- upload 3MB fake video in 1MB chunks ---
const init = await cs.fetch("/api/upload/init", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "E2E test video", description: "scripted", mimeType: "video/mp4" }),
});
const { videoId } = await init.json();
assert(init.ok && videoId, "upload init returns videoId");

const data = Buffer.alloc(3 * 1024 * 1024, 7);
for (let off = 0; off < data.length; off += 1024 * 1024) {
  const r = await cs.fetch(`/api/upload/chunk?videoId=${videoId}&offset=${off}`, {
    method: "POST",
    body: data.subarray(off, off + 1024 * 1024),
  });
  if (!r.ok) throw new Error("chunk failed " + (await r.text()));
}
// out-of-sync chunk should 409 with expected offset
const dup = await cs.fetch(`/api/upload/chunk?videoId=${videoId}&offset=0`, {
  method: "POST",
  body: data.subarray(0, 1024),
});
assert(dup.status === 409, "duplicate offset rejected with 409");

const done = await cs.fetch("/api/upload/complete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ videoId }),
});
const quote = await done.json();
assert(done.ok && BigInt(quote.quoteLamports) > 0n, `quote: ${quote.quoteLamports} lamports for 3MB`);
assert(quote.sha256?.length === 64, "sha256 computed");

// --- pay endpoint should reject an unverifiable signature ---
const badPay = await cs.fetch("/api/pay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ videoId, signature: bs58.encode(Buffer.alloc(64, 1)), currency: "SOL" }),
});
assert(badPay.status === 402 || badPay.status === 400, "fake payment signature rejected");

// --- simulate verified payment (real one needs funded wallet) ---
await db.payment.update({
  where: { videoId },
  data: { status: "verified", amountLamports: BigInt(quote.quoteLamports), txSignature: "SIMULATED_" + videoId },
});
await db.video.update({ where: { id: videoId }, data: { status: "in_review" } });
console.log("  (payment simulated via DB — real path needs funded wallet)");

// --- mod: sign in, see queue, preview, reject ---
const ms = new Session();
const mRes = await ms.signIn(mod);
assert(mRes.role === "mod", "mod wallet gets role=mod");

const modBlockedForCreator = await cs.fetch("/api/mod/queue");
assert(modBlockedForCreator.status === 403, "creator blocked from mod queue");

const queue = await (await ms.fetch("/api/mod/queue")).json();
assert(queue.some((v) => v.id === videoId), "video appears in mod queue");

const prev = await ms.fetch(`/api/mod/preview/${videoId}`, { headers: { range: "bytes=0-1023" } });
assert(prev.status === 206 && prev.headers.get("content-range")?.includes("/3145728"), "mod preview streams with range support");

const rej = await ms.fetch("/api/mod/review", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ videoId, decision: "rejected", reason: "e2e test rejection" }),
});
const rejJ = await rej.json();
assert(rej.ok, "rejection succeeds");

const after = await db.video.findUnique({ where: { id: videoId }, include: { payment: true, review: true } });
assert(after.status === "rejected", "video status = rejected");
assert(after.filePath === null, "filePath cleared");
assert(!fs.existsSync(`held/${videoId}.bin`), "held file deleted from disk");
assert(["refunded", "refund_pending"].includes(after.payment.status), `refund status: ${after.payment.status} (pending = treasury unfunded, expected)`);
assert(after.review?.decision === "rejected" && after.review.reason === "e2e test rejection", "audit review row written");

// --- approve path: second upload, expect Irys failure without funds (or success if funded) ---
const init2 = await cs.fetch("/api/upload/init", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "E2E approve-path video", mimeType: "video/mp4" }),
});
const { videoId: v2 } = await init2.json();
await cs.fetch(`/api/upload/chunk?videoId=${v2}&offset=0`, { method: "POST", body: data.subarray(0, 1024 * 1024) });
await cs.fetch("/api/upload/complete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ videoId: v2 }),
});
await db.payment.update({ where: { videoId: v2 }, data: { status: "verified", txSignature: "SIMULATED_" + v2 } });
await db.video.update({ where: { id: v2 }, data: { status: "in_review" } });

const app = await ms.fetch("/api/mod/review", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ videoId: v2, decision: "approved" }),
});
const appJ = await app.json();
if (app.ok) {
  assert(!!appJ.arweaveTx, `APPROVED + published to Arweave: ${appJ.arweaveTx}`);
} else {
  assert(app.status === 502 && /arweave publish failed/.test(appJ.error), `approve fails cleanly without funded treasury (${appJ.error?.slice(0, 80)})`);
  const v2row = await db.video.findUnique({ where: { id: v2 } });
  assert(v2row.status === "in_review", "video stays in_review after failed publish (retryable)");
}

await db.$disconnect();
console.log("\ndone");
