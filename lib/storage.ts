import { cleanupPublishedCache } from "./retention";
import fs from "fs";
import crypto from "crypto";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { db } from "./db";
import { HttpError } from "./http";
import { fileHash, safeHeldPath } from "./uploads";
import { archiveMetadata, archiveSizes } from "./archive";
export function publishingEnabled() {
  return (
    process.env.PUBLISHING_ENABLED === "true" &&
    !!process.env.STORAGE_KEYPAIR_PATH
  );
}
async function storageClient() {
  if (!publishingEnabled())
    throw new HttpError(503, "Permanent publishing is not open yet.");
  const raw = JSON.parse(
    fs.readFileSync(process.env.STORAGE_KEYPAIR_PATH!, "utf8"),
  );
  const key = Keypair.fromSecretKey(Uint8Array.from(raw));
  if (
    crypto
      .createHash("sha256")
      .update(key.publicKey.toBase58())
      .digest("hex") === process.env.TREASURY_WALLET_HASH
  )
    throw new HttpError(503, "Use a separate operational storage wallet.");
  const { TurboFactory } = await import("@ardrive/turbo-sdk/node");
  return TurboFactory.authenticated({
    privateKey: bs58.encode(key.secretKey),
    token: "solana",
  });
}
export async function ensureStorageFunded(sizes: number[]) {
  const turbo = await storageClient();
  const [balance, costs] = await Promise.all([
    turbo.getBalance(),
    turbo.getUploadCosts({ bytes: sizes.map((n) => n + 16384) }),
  ]);
  if (
    costs.length !== sizes.length ||
    BigInt(balance.winc) < costs.reduce((sum, c) => sum + BigInt(c.winc), 0n)
  )
    throw new HttpError(
      503,
      "The preservation service is awaiting funding. No new payment is required.",
    );
}
export async function publishVideo(videoId: string, creatorId: string) {
  if (!publishingEnabled())
    throw new HttpError(503, "Permanent publishing is not open yet.");
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: {
      creator: true,
      payment: true,
      ballots: true,
      founderRecord: true,
    },
  });
  if (!video || video.creatorId !== creatorId)
    throw new HttpError(404, "Submission not found.");
  if (video.status === "published" || video.status === "publishing")
    return { status: video.status, arweaveTx: video.arweaveTx };
  if (
    video.status !== "publish_queued" ||
    !(
      video.payment?.status === "verified" ||
      (video.publicationMethod === "founder" &&
        video.founderRecord?.wallet === video.creator.wallet)
    ) ||
    !video.filePath ||
    !video.sha256
  )
    throw new HttpError(409, "This submission is not ready for preservation.");
  if (
    (video.publicationMethod !== "founder" &&
      video.payment?.fileSha256 !== video.sha256) ||
    (await fileHash(video.filePath)) !== video.sha256
  )
    throw new HttpError(409, "The file does not match the approved record.");
  await ensureStorageFunded(archiveSizes(video));
  const claim = await db.video.updateMany({
    where: { id: videoId, status: "publish_queued" },
    data: { status: "publishing", publishClaimedAt: new Date() },
  });
  if (claim.count !== 1)
    throw new HttpError(409, "Preservation has already started.");
  try {
    const turbo = await storageClient();
    // Tags remain small. Context and signed ballots have their own immutable JSON item.
    const receipt = await turbo.uploadFile({
      fileStreamFactory: () =>
        fs.createReadStream(safeHeldPath(video.filePath!)),
      fileSizeFactory: () => Number(video.sizeBytes),
      maxChunkConcurrency: 1,
      chunkByteCount: 8 * 1024 * 1024,
      dataItemOpts: {
        tags: [
          { name: "Content-Type", value: video.mimeType },
          { name: "App-Name", value: "Nikki" },
          { name: "Nikki-Version", value: "1" },
          { name: "Nikki-Proposal", value: video.id },
          { name: "File-SHA256", value: video.sha256 },
        ],
      },
    });
    if (!/^[A-Za-z0-9_-]{43}$/.test(receipt.id))
      throw new Error("Invalid storage receipt.");
    const archiveJson = archiveMetadata(video, receipt.id);
    // Save the video receipt before a second network operation; recovery must reuse it.
    await db.video.update({
      where: { id: videoId },
      data: {
        arweaveTx: receipt.id,
        storageReceipt: JSON.stringify({ video: receipt }),
        archiveJson,
        publicationError: null,
      },
    });
    const record = await turbo.upload({
      data: archiveJson,
      dataItemOpts: {
        tags: [
          { name: "Content-Type", value: "application/json" },
          { name: "App-Name", value: "Nikki" },
          { name: "Nikki-Proposal", value: video.id },
          { name: "Nikki-Video", value: receipt.id },
        ],
      },
    });
    if (!/^[A-Za-z0-9_-]{43}$/.test(record.id))
      throw new Error("Invalid metadata receipt.");
    await db.video.update({
      where: { id: videoId },
      data: {
        recordTx: record.id,
        storageReceipt: JSON.stringify({ video: receipt, record }),
      },
    });
    return { status: "publishing", arweaveTx: receipt.id };
  } catch {
    // An uncertain upload needs receipt reconciliation before any retry.
    await db.video.update({
      where: { id: videoId },
      data: {
        status: "publish_failed",
        publicationError:
          video.publicationMethod === "founder"
            ? "The founding record needs storage reconciliation. Its approval is retained."
            : "Storage needs reconciliation. Your payment is recorded; do not pay again.",
      },
    });
    throw new HttpError(
      502,
      video.publicationMethod === "founder"
        ? "The founding record needs storage recovery. Do not submit it again."
        : "Preservation needs recovery. Your payment is recorded; do not pay again.",
    );
  }
}
async function verifyContent(
  transactionId: string,
  expectedBytes: bigint,
  expectedHash: string,
) {
  const response = await fetch("https://arweave.net/" + transactionId, {
    signal: AbortSignal.timeout(300000),
    cache: "no-store",
  });
  if (!response.ok || !response.body)
    throw new HttpError(503, "Stored content is not retrievable yet.");
  const reader = response.body.getReader(),
    hash = crypto.createHash("sha256");
  let bytes = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    bytes += r.value.length;
    if (BigInt(bytes) > expectedBytes) {
      await reader.cancel();
      throw new HttpError(502, "Stored size differs from the approved record.");
    }
    hash.update(r.value);
  }
  if (BigInt(bytes) !== expectedBytes || hash.digest("hex") !== expectedHash)
    throw new HttpError(
      502,
      "Stored content differs from the approved record.",
    );
}
export async function verifyStoredVideo(videoId: string, creatorId: string) {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video || video.creatorId !== creatorId)
    throw new HttpError(404, "Record not found.");
  if (video.status === "published")
    return { status: "published", arweaveTx: video.arweaveTx };
  if (
    video.status !== "publishing" ||
    !video.arweaveTx ||
    !video.recordTx ||
    !video.archiveJson ||
    !video.sha256
  )
    throw new HttpError(
      409,
      "Both storage receipts are required before verification.",
    );
  if (
    !(await verifyArchiveObjects({
      arweaveTx: video.arweaveTx,
      recordTx: video.recordTx,
      archiveJson: video.archiveJson,
      sizeBytes: video.sizeBytes,
      sha256: video.sha256,
    }))
  )
    return {
      status: "publishing",
      message:
        "Waiting for Arweave confirmation of the video and review record.",
    };
  await db.video.updateMany({
    where: { id: videoId, status: "publishing" },
    data: {
      status: "published",
      publishedAt: new Date(),
      publicationError: null,
    },
  });
  await cleanupPublishedCache(videoId);
  return { status: "published", arweaveTx: video.arweaveTx };
}

export async function verifyArchiveObjects(video: {
  arweaveTx: string;
  recordTx: string;
  archiveJson: string;
  sizeBytes: bigint;
  sha256: string;
}) {
  const ids = [video.arweaveTx, video.recordTx];
  const gql = await fetch("https://arweave.net/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "query($ids: [ID!]!) { transactions(ids: $ids) { edges { node { id block { height } } } } }",
      variables: { ids },
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!gql.ok)
    throw new HttpError(
      503,
      "Storage confirmation is temporarily unavailable.",
    );
  const graph = await gql.json(),
    nodes = graph.data?.transactions?.edges?.map((e: any) => e.node) || [];
  if (
    !ids.every((id) =>
      nodes.some((n: any) => n.id === id && Number.isInteger(n.block?.height)),
    )
  )
    return false;
  await verifyContent(
    video.recordTx,
    BigInt(Buffer.byteLength(video.archiveJson)),
    crypto.createHash("sha256").update(video.archiveJson).digest("hex"),
  );
  await verifyContent(video.arweaveTx, video.sizeBytes, video.sha256);
  return true;
}
