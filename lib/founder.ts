import { createHash } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import type { Video } from "@prisma/client";
import { appOrigin, HttpError } from "./http";
import { db } from "./db";
import { requireFounder } from "./release";
import { requireWorkerReady } from "./health";
import { ensureStorageFunded, publishingEnabled } from "./storage";
export function founderMessage(video: Video, wallet: string, issuedAt: string) {
  const packageHash = createHash("sha256")
    .update(
      JSON.stringify({
        id: video.id,
        title: video.title,
        description: video.description,
        category: video.category,
        language: video.language,
        recordedAt: video.recordedAt,
        source: video.source,
        sha256: video.sha256,
        bytes: video.sizeBytes.toString(),
        mimeType: video.mimeType,
      }),
    )
    .digest("hex");
  return [
    "Publish Nikki’s founding record",
    "Origin: " + appOrigin(),
    "Creator: " + wallet,
    "Submission: " + video.id,
    "File SHA-256: " + video.sha256,
    "Record SHA-256: " + packageHash,
    "I approve permanent public preservation of this exact record. This is a founder publication, without community voting. Nikki provides no deletion or delisting.",
    "Issued: " + issuedAt,
  ].join("\n");
}
export async function founderSubmission(
  videoId: string,
  user: { id: string; wallet: string },
) {
  requireFounder(user.wallet);
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (
    !video ||
    video.creatorId !== user.id ||
    video.status !== "snapshot_pending" ||
    !video.sha256 ||
    !video.filePath
  )
    throw new HttpError(
      409,
      "Complete your video upload before approving the founding record.",
    );
  if (await db.founderRecord.findUnique({ where: { id: "founding-record" } }))
    throw new HttpError(
      409,
      "The founding record has already been reserved or published.",
    );
  return video;
}
export async function founderServiceReady(bytes: number) {
  if (!publishingEnabled())
    throw new HttpError(503, "Permanent storage has not been configured yet.");
  await requireWorkerReady();
  // The project’s prepaid credits cover the founding record, including signed metadata.
  await ensureStorageFunded([bytes, 32768]);
}
export async function queueFoundingRecord(
  videoId: string,
  user: { id: string; wallet: string },
  signature: unknown,
  issuedAt: unknown,
) {
  const video = await founderSubmission(videoId, user);
  if (
    typeof signature !== "string" ||
    signature.length > 100 ||
    typeof issuedAt !== "string" ||
    !Number.isFinite(Date.parse(issuedAt)) ||
    Math.abs(Date.now() - Date.parse(issuedAt)) > 300000
  )
    throw new HttpError(
      400,
      "The publication confirmation expired or is invalid.",
    );
  const message = founderMessage(video, user.wallet, issuedAt);
  let valid = false;
  try {
    valid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      new PublicKey(user.wallet).toBytes(),
    );
  } catch {}
  if (!valid)
    throw new HttpError(
      403,
      "The founder’s publication signature could not be verified.",
    );
  await founderServiceReady(Number(video.sizeBytes));
  await db.$transaction(async (tx) => {
    if (await tx.founderRecord.findUnique({ where: { id: "founding-record" } }))
      throw new HttpError(
        409,
        "The founding record has already been reserved.",
      );
    const claimed = await tx.video.updateMany({
      where: {
        id: videoId,
        creatorId: user.id,
        status: "snapshot_pending",
        sha256: video.sha256,
      },
      data: {
        status: "publish_queued",
        publicationMethod: "founder",
        finalizedAt: new Date(),
      },
    });
    if (claimed.count !== 1)
      throw new HttpError(409, "This submission is no longer ready.");
    await tx.founderRecord.create({
      data: {
        id: "founding-record",
        videoId,
        wallet: user.wallet,
        message,
        signature,
      },
    });
  });
  return { status: "publish_queued" };
}
