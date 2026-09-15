import type { Video, User, Ballot, FounderRecord } from "@prisma/client";
type RecordInput = Video & {
  creator: User;
  ballots: Ballot[];
  founderRecord?: FounderRecord | null;
};
export function archiveMetadata(video: RecordInput, videoTx = "0".repeat(43)) {
  return JSON.stringify({
    schema: "nikki.archive.v1",
    proposal: video.id,
    title: video.title,
    description: video.description,
    category: video.category,
    language: video.language,
    recordedAt: video.recordedAt,
    source: video.source,
    creator: video.creator.wallet,
    video: {
      transactionId: videoTx,
      sha256: video.sha256,
      bytes: video.sizeBytes.toString(),
      contentType: video.mimeType,
    },
    publicationMethod: video.publicationMethod,
    founderApproval: video.founderRecord
      ? {
          wallet: video.founderRecord.wallet,
          message: video.founderRecord.message,
          signature: video.founderRecord.signature,
        }
      : undefined,
    review:
      video.publicationMethod === "founder"
        ? { method: "founder", communityVote: false }
        : {
            opensAt: video.voteOpensAt?.toISOString(),
            closesAt: video.voteClosesAt?.toISOString(),
            snapshot: {
              slot: video.snapshotSlot?.toString(),
              hash: video.snapshotHash,
              mint: video.snapshotMint,
              decimals: video.snapshotDecimals,
            },
            rule: { hours: 24, minimumVoters: 5, minimumYesPercent: 80 },
            yes: video.yesCount,
            no: video.noCount,
            ballots: [...video.ballots]
              .sort((a, b) => a.wallet.localeCompare(b.wallet))
              .map((b) => ({
                wallet: b.wallet,
                xId: b.xId,
                xUsername: b.xUsername,
                choice: b.choice,
                reason: b.reason,
                signature: b.signature,
                message: b.message,
              })),
          },
  });
}
export function archiveSizes(video: RecordInput) {
  const metadataBytes = Buffer.byteLength(archiveMetadata(video), "utf8");
  if (metadataBytes > 1_000_000)
    throw new Error("Archive metadata exceeds its limit.");
  return [Number(video.sizeBytes), metadataBytes];
}
