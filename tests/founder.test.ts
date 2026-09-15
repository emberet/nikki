import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { founderMessage } from "../lib/founder";
import { archiveMetadata } from "../lib/archive";
import { publicRecord, escapeHtml } from "../lib/public-record";
import { assertNewUploadsAllowed } from "../lib/release";
import { readBoundedBody } from "../lib/request-body";
import { verifyArchiveObjects } from "../lib/storage";
import { createHash } from "node:crypto";

test("public export accepts signed founder records and rejects private, changed, or forged records", () => {
  const key = nacl.sign.keyPair();
  const wallet = bs58.encode(key.publicKey);
  const video: any = {
    id: "founder-test",
    title: "A record",
    description: "History",
    category: "History",
    language: "English",
    recordedAt: null,
    source: "Creator",
    sha256: "a".repeat(64),
    sizeBytes: 10n,
    mimeType: "video/mp4",
    creator: { wallet },
    publicationMethod: "founder",
    status: "published",
    publishedAt: new Date(),
    arweaveTx: "a".repeat(43),
    recordTx: "b".repeat(43),
    ballots: [],
    filePath: "/private/held.mp4",
  };
  const message = founderMessage(video, wallet, new Date().toISOString());
  video.founderRecord = {
    wallet,
    message,
    signature: bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), key.secretKey),
    ),
  };
  video.archiveJson = archiveMetadata(video, video.arweaveTx);
  const record = publicRecord(video, wallet);
  assert.equal(record.archive.review.communityVote, false);
  assert.equal("filePath" in record, false);
  for (const change of [
    { status: "publishing" },
    { title: "Changed" },
    { publicationMethod: "community" },
    { arweaveTx: "invalid" },
    {
      founderRecord: {
        ...video.founderRecord,
        signature: bs58.encode(new Uint8Array(64)),
      },
    },
  ])
    assert.throws(() => publicRecord({ ...video, ...change }, wallet));
  assert.throws(() =>
    publicRecord(video, bs58.encode(nacl.sign.keyPair().publicKey)),
  );
  assert.equal(escapeHtml('<script>"&'), "&lt;script&gt;&quot;&amp;");
});

test("founder uploads reject other wallets and unconfigured production defaults closed", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.RELEASE_MODE;
    process.env.UPLOADS_ENABLED = "true";
    assert.throws(() => assertNewUploadsAllowed("visitor"), /not open/);
    process.env.RELEASE_MODE = "founder";
    process.env.FOUNDER_WALLET = "founder";
    assert.throws(() => assertNewUploadsAllowed("visitor"), /founder/);
    assert.doesNotThrow(() => assertNewUploadsAllowed("founder"));
    process.env.UPLOADS_ENABLED = "false";
    assert.throws(() => assertNewUploadsAllowed("founder"), /not open/);
  } finally {
    for (const key of [
      "NODE_ENV",
      "RELEASE_MODE",
      "UPLOADS_ENABLED",
      "FOUNDER_WALLET",
    ])
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
  }
});

test("chunk reader caps unknown-length bodies and times out stalled uploads", async () => {
  const request = (stream: ReadableStream) =>
    new Request("http://local", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
  await assert.rejects(
    () =>
      readBoundedBody(
        request(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(11));
              c.close();
            },
          }),
        ),
        10,
      ),
    /too large/,
  );
  await assert.rejects(
    () => readBoundedBody(request(new ReadableStream()), 10, 10),
    /too long/,
  );
});

test("receipt reconciliation verifies both objects before any database update", async () => {
  const original = globalThis.fetch;
  const body = "source video";
  const candidate = {
    arweaveTx: "a".repeat(43),
    recordTx: "b".repeat(43),
    archiveJson: '{"signed":true}',
    sizeBytes: BigInt(Buffer.byteLength(body)),
    sha256: createHash("sha256").update(body).digest("hex"),
  };
  let confirmed = false;
  let tampered = false;
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/graphql"))
        return Response.json({
          data: {
            transactions: {
              edges: [candidate.arweaveTx, candidate.recordTx].map((id) => ({
                node: { id, block: confirmed ? { height: 123 } : null },
              })),
            },
          },
        });
      return new Response(
        url.endsWith(candidate.recordTx)
          ? candidate.archiveJson
          : tampered
            ? "wrong bytes!"
            : body,
      );
    };
    assert.equal(await verifyArchiveObjects(candidate), false);
    confirmed = true;
    assert.equal(await verifyArchiveObjects(candidate), true);
    tampered = true;
    await assert.rejects(() => verifyArchiveObjects(candidate), /differs/);
  } finally {
    globalThis.fetch = original;
  }
});
