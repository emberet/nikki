import { db } from "../lib/db";
import { archiveMetadata } from "../lib/archive";
import { verifyArchiveObjects } from "../lib/storage";
async function main() {
  const [videoId, videoTx, recordTx] = process.argv.slice(2);
  if (
    !videoId ||
    !videoTx ||
    !recordTx ||
    ![videoTx, recordTx].every((id) => /^[A-Za-z0-9_-]{43}$/.test(id))
  )
    throw Error(
      "Usage: npm run storage:reconcile -- VIDEO_ID VIDEO_TRANSACTION_ID RECORD_TRANSACTION_ID",
    );
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: {
      creator: true,
      ballots: true,
      founderRecord: true,
      payment: true,
    },
  });
  if (!video || !["publish_failed", "publishing"].includes(video.status))
    throw Error("Only an interrupted preservation can be reconciled.");
  if (video.arweaveTx && video.arweaveTx !== videoTx)
    throw Error("The video ID differs from the saved receipt.");
  if (video.recordTx && video.recordTx !== recordTx)
    throw Error("The metadata ID differs from the saved receipt.");
  const archiveJson = video.archiveJson || archiveMetadata(video, videoTx);
  // Verify candidate IDs before saving them. A wrong receipt must leave the record unchanged.
  if (!video.sha256) throw Error("The approved fingerprint is missing.");
  const verified = await verifyArchiveObjects({
    arweaveTx: videoTx,
    recordTx,
    archiveJson,
    sizeBytes: video.sizeBytes,
    sha256: video.sha256,
  });
  if (!verified)
    throw Error(
      "Both items need block confirmation before reconciliation. No record was changed.",
    );
  const updated = await db.video.updateMany({
    where: {
      id: videoId,
      status: video.status,
      arweaveTx: video.arweaveTx,
      recordTx: video.recordTx,
    },
    data: {
      arweaveTx: videoTx,
      recordTx,
      archiveJson,
      status: "published",
      publishedAt: new Date(),
      publicationError: null,
    },
  });
  if (updated.count !== 1)
    throw Error(
      "The record changed during verification. Inspect its current state.",
    );
  console.log(JSON.stringify({ status: "published", arweaveTx: videoTx }));
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Reconciliation failed.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
