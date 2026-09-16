import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Video } from "@prisma/client";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { archiveMetadata } from "../lib/archive";
import { communitiesDrop } from "../lib/communities-drop";
import { founderMessage } from "../lib/founder";
import { founderReleaseSlot } from "../lib/founder-release-slot";

function fixture() {
  const key = nacl.sign.keyPair();
  const wallet = bs58.encode(key.publicKey);
  const video: any = {
    id: "first-record",
    title: "Nikki is live?",
    description: "Original film",
    category: "Culture",
    language: "English",
    recordedAt: null,
    source: "Nikki",
    sha256: "a".repeat(64),
    sizeBytes: 10n,
    mimeType: "video/mp4",
    creator: { id: "founder", wallet },
    publicationMethod: "founder",
    status: "published",
    publishedAt: new Date("2026-09-16T00:00:00Z"),
    arweaveTx: "a".repeat(43),
    recordTx: "b".repeat(43),
    ballots: [],
  };
  const message = founderMessage(video, wallet, "2026-09-16T00:00:00Z");
  const first: any = {
    id: "founding-record",
    videoId: video.id,
    wallet,
    message,
    signature: bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), key.secretKey),
    ),
    video,
  };
  video.archiveJson = archiveMetadata(
    { ...video, founderRecord: first },
    video.arweaveTx,
  );
  const second = {
    id: "prepared-second-film",
    ...communitiesDrop,
    recordedAt: null,
    sizeBytes: BigInt(communitiesDrop.sizeBytes),
  } as unknown as Video;
  return { wallet, first, second };
}

test("legacy founder signing text remains byte-for-byte stable", () => {
  const saved = process.env.APP_URL;
  try {
    process.env.APP_URL = "https://nikki.run";
    const video = {
      id: "legacy",
      title: "A record",
      description: "History",
      category: "History",
      language: "English",
      recordedAt: null,
      source: "Creator",
      sha256: "a".repeat(64),
      sizeBytes: 10n,
      mimeType: "video/mp4",
    } as Video;
    const message = founderMessage(video, "creator", "2026-09-16T00:00:00Z");
    assert.equal(
      message,
      [
        "Publish Nikki’s founding record",
        "Origin: https://nikki.run",
        "Creator: creator",
        "Submission: legacy",
        "File SHA-256: " + "a".repeat(64),
        "Record SHA-256: 0434240e11666fd271b5d4ca4282dbfba6990aa8a53b7c129716d16ef2e10a25",
        "I approve permanent public preservation of this exact record. This is a founder publication, without community voting. Nikki provides no deletion or delisting.",
        "Issued: 2026-09-16T00:00:00Z",
      ].join("\n"),
    );
    assert.equal(
      founderMessage(
        { ...video, founderReleaseSlot: "founding-record" },
        "creator",
        "2026-09-16T00:00:00Z",
      ),
      message,
    );
    assert.equal(
      founderMessage(
        { ...video, founderReleaseSlot: "creator-drop-002" },
        "creator",
        "2026-09-16T00:00:00Z",
      ),
      message.replace(
        "Publish Nikki’s founding record",
        "Publish Nikki’s creator drop 002",
      ),
    );
  } finally {
    if (saved === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved;
  }
});

test("a verified first publication opens exactly one prepared second release", () => {
  const { wallet, first, second } = fixture();
  const before = structuredClone(first);
  assert.equal(
    founderReleaseSlot(second, wallet, first, null),
    "creator-drop-002",
  );
  assert.deepEqual(first, before);
  assert.equal(
    founderReleaseSlot(first.video, wallet, null, null),
    "founding-record",
  );
  assert.throws(
    () => founderReleaseSlot(second, wallet, null, null),
    /must be verified/,
  );
  assert.throws(
    () => founderReleaseSlot(second, wallet, first, { id: "creator-drop-002" }),
    /already been reserved/,
  );
  assert.throws(
    () => founderReleaseSlot(first.video, wallet, first, null),
    /must be verified/,
  );
});

test("second release rejects a changed file or any changed signed metadata", () => {
  const { wallet, first, second } = fixture();
  const changes: Partial<Video>[] = [
    { title: second.title + "!" },
    { description: second.description + " altered" },
    { category: "History" },
    { language: "Hindi" },
    { source: "Other film" },
    { recordedAt: "2026-09-17" },
    { sizeBytes: second.sizeBytes + 1n },
    { sha256: "b".repeat(64) },
    { mimeType: "video/webm" },
  ];
  for (const change of changes)
    assert.throws(
      () => founderReleaseSlot({ ...second, ...change }, wallet, first, null),
      /Only the exact prepared/,
      JSON.stringify(change, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
});

test("a reserved, unconfirmed, forged, or mismatched first record cannot open the second slot", () => {
  for (const change of [
    { status: "publish_queued" },
    { status: "publishing" },
    { publishedAt: null },
    { arweaveTx: null },
    { recordTx: "not-an-archive-id" },
    { archiveJson: null },
    { title: "Unsigned edit" },
    { publicationMethod: "community" },
  ]) {
    const { wallet, first, second } = fixture();
    assert.throws(
      () =>
        founderReleaseSlot(
          second,
          wallet,
          { ...first, video: { ...first.video, ...change } },
          null,
        ),
      /must be verified/,
    );
  }
  const { wallet, first, second } = fixture();
  for (const change of [
    { signature: bs58.encode(new Uint8Array(64)) },
    { wallet: bs58.encode(nacl.sign.keyPair().publicKey) },
    { videoId: "other" },
    { id: "other-slot" },
  ])
    assert.throws(
      () => founderReleaseSlot(second, wallet, { ...first, ...change }, null),
      /must be verified/,
    );
});

test("the migrated database prevents duplicate slots and reused video reservations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nikki-founder-slots-"));
  const client = new PrismaClient({
    datasources: { db: { url: `file:${path.join(directory, "test.db")}` } },
  });
  try {
    const migrationRoot = path.resolve("prisma/migrations");
    for (const entry of (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = await readFile(
        path.join(migrationRoot, entry.name, "migration.sql"),
        "utf8",
      );
      for (const statement of sql.split(";").filter((part) => part.trim()))
        await client.$executeRawUnsafe(statement);
    }
    const creator = await client.user.create({
      data: { wallet: "test-wallet" },
    });
    const videos: Video[] = [];
    for (const title of ["first", "second", "duplicate"])
      videos.push(
        await client.video.create({ data: { title, creatorId: creator.id } }),
      );
    const create = (id: string, videoId: string) =>
      client.founderRecord.create({
        data: {
          id,
          videoId,
          wallet: creator.wallet,
          message: "m",
          signature: "s",
        },
      });
    const first = await create("founding-record", videos[0].id);
    await create("creator-drop-002", videos[1].id);
    await assert.rejects(() => create("creator-drop-002", videos[2].id), {
      code: "P2002",
    });
    await assert.rejects(() => create("another-slot", videos[1].id), {
      code: "P2002",
    });
    assert.deepEqual(
      await client.founderRecord.findUnique({
        where: { id: "founding-record" },
      }),
      first,
    );
    assert.equal(await client.founderRecord.count(), 2);
  } finally {
    await client.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
