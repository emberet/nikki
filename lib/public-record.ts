import type { Video, User, FounderRecord } from "@prisma/client";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "crypto";

export function escapeHtml(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

// Only confirmed, signed founder publications may enter the founding release.
// Never export held paths, users, sessions, quotes, or payment records.
export function publicRecord(
  video: Video & { creator: User; founderRecord: FounderRecord | null },
  founder: string,
) {
  const approval = video.founderRecord;
  if (
    video.status !== "published" ||
    video.publicationMethod !== "founder" ||
    video.creator.wallet !== founder ||
    approval?.wallet !== founder ||
    !video.publishedAt ||
    !video.archiveJson ||
    !/^[A-Za-z0-9_-]{43}$/.test(video.arweaveTx || "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(video.recordTx || "") ||
    !/^[a-f0-9]{64}$/.test(video.sha256 || "")
  )
    throw Error("A record is not a verified founder publication: " + video.id);
  const archive = JSON.parse(video.archiveJson);
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
  if (
    archive.proposal !== video.id ||
    archive.title !== video.title ||
    archive.description !== video.description ||
    archive.creator !== founder ||
    archive.video?.transactionId !== video.arweaveTx ||
    archive.video?.sha256 !== video.sha256 ||
    archive.video?.bytes !== video.sizeBytes.toString() ||
    archive.publicationMethod !== "founder" ||
    archive.founderApproval?.signature !== approval.signature ||
    !approval.message.includes("\nRecord SHA-256: " + packageHash + "\n") ||
    !nacl.sign.detached.verify(
      new TextEncoder().encode(approval.message),
      bs58.decode(approval.signature),
      bs58.decode(founder),
    )
  )
    throw Error(
      "The public record does not match its signed archive: " + video.id,
    );
  return {
    title: video.title,
    description: video.description,
    category: video.category,
    language: video.language,
    recordedAt: video.recordedAt,
    source: video.source,
    creator: founder,
    sha256: video.sha256!,
    sizeBytes: video.sizeBytes.toString(),
    mimeType: video.mimeType,
    arweaveTx: video.arweaveTx!,
    recordTx: video.recordTx!,
    publishedAt: video.publishedAt.toISOString(),
    publicationMethod: "founder",
    archive,
  };
}
