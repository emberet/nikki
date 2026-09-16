import { createHash } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import type { Prisma, Video } from "@prisma/client";
import { appOrigin, HttpError } from "./http";
import { db } from "./db";
import { requireFounder } from "./release";
import { requireWorkerReady } from "./health";
import { ensureStorageFunded, publishingEnabled } from "./storage";
import {
  founderReleaseSlot,
  type FounderReleaseSlot,
  type FounderSubmission,
} from "./founder-release-slot";

export function founderMessage(
  video: Video & { founderReleaseSlot?: FounderReleaseSlot },
  wallet: string,
  issuedAt: string,
) {
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
    video.founderReleaseSlot === "creator-drop-002"
      ? "Publish Nikki’s creator drop 002"
      : "Publish Nikki’s founding record",
    "Origin: " + appOrigin(),
    "Creator: " + wallet,
    "Submission: " + video.id,
    "File SHA-256: " + video.sha256,
    "Record SHA-256: " + packageHash,
    "I approve permanent public preservation of this exact record. This is a founder publication, without community voting. Nikki provides no deletion or delisting.",
    "Issued: " + issuedAt,
  ].join("\n");
}

async function submissionSlot(
  video: Video,
  wallet: string,
  client: Pick<Prisma.TransactionClient, "founderRecord"> = db,
) {
  const [founding, second] = await Promise.all([
    client.founderRecord.findUnique({
      where: { id: "founding-record" },
      include: { video: { include: { creator: true } } },
    }),
    client.founderRecord.findUnique({
      where: { id: "creator-drop-002" },
      select: { id: true },
    }),
  ]);
  return founderReleaseSlot(video, wallet, founding, second);
}

export async function founderSubmission(
  videoId: string,
  user: { id: string; wallet: string },
): Promise<FounderSubmission> {
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
      "Complete your video upload before approving this creator drop.",
    );
  return {
    ...video,
    founderReleaseSlot: await submissionSlot(video, user.wallet),
  };
}
export async function founderServiceReady(bytes: number) {
  if (!publishingEnabled())
    throw new HttpError(503, "Permanent storage has not been configured yet.");
  await requireWorkerReady();
  // Project prepaid credits cover the authorized drop, including signed metadata.
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
    const current = await tx.video.findUnique({ where: { id: videoId } });
    if (
      !current ||
      current.creatorId !== user.id ||
      current.status !== "snapshot_pending" ||
      !current.sha256 ||
      !current.filePath
    )
      throw new HttpError(409, "This submission is no longer ready.");
    const slot = await submissionSlot(current, user.wallet, tx);
    if (
      slot !== video.founderReleaseSlot ||
      founderMessage(
        { ...current, founderReleaseSlot: slot },
        user.wallet,
        issuedAt,
      ) !== message
    )
      throw new HttpError(
        409,
        "This submission changed after its publication confirmation.",
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
        id: slot,
        videoId,
        wallet: user.wallet,
        message,
        signature,
      },
    });
  });
  return { status: "publish_queued" };
}
