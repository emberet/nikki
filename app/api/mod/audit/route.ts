import { db } from "@/lib/db";
import { api, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  const videos = await db.video.findMany({
    where: { status: "published" },
    include: {
      founderRecord: true,
      ballots: {
        select: {
          wallet: true,
          choice: true,
          reason: true,
          signature: true,
          message: true,
          xUsername: true,
          updatedAt: true,
        },
      },
    },
    take: 100,
    orderBy: { publishedAt: "desc" },
  });
  return json(
    videos.map((v) => ({
      id: v.id,
      publicationMethod: v.publicationMethod,
      founderApproval: v.founderRecord
        ? {
            wallet: v.founderRecord.wallet,
            message: v.founderRecord.message,
            signature: v.founderRecord.signature,
          }
        : null,
      title: v.title,
      arweaveTx: v.arweaveTx,
      recordTx: v.recordTx,
      sha256: v.sha256,
      snapshotHash: v.snapshotHash,
      snapshotSlot: v.snapshotSlot?.toString(),
      voteClosesAt: v.voteClosesAt,
      ballots: v.ballots,
    })),
  );
});
