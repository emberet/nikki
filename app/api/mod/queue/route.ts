import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, json } from "@/lib/http";
import { closeDueElections } from "@/lib/governance";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  const { user } = await requireUser();
  await closeDueElections();
  const records = await db.video.findMany({
    where: {
      status: {
        in: ["voting", "approved", "rejected", "expired", "published"],
      },
    },
    include: {
      creator: { select: { wallet: true } },
      eligibleVoters: { where: { wallet: user.wallet } },
      ballots: { select: { wallet: true, choice: true, xUsername: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json(
    records
      .filter(
        (v) =>
          v.status === "published" ||
          v.creatorId === user.id ||
          v.eligibleVoters.some((e) => e.xId === user.xId),
      )
      .map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description,
        category: v.category,
        creator: v.creator.wallet,
        sizeBytes: v.sizeBytes.toString(),
        sha256: v.sha256,
        status: v.status,
        voteClosesAt: v.voteClosesAt,
        snapshotSlot: v.snapshotSlot?.toString(),
        yes: v.ballots.filter((b) => b.choice === "yes").length,
        no: v.ballots.filter((b) => b.choice === "no").length,
        canVote:
          v.status === "voting" &&
          v.eligibleVoters.some((e) => e.xId === user.xId),
        myVote: v.ballots.find((b) => b.wallet === user.wallet)?.choice ?? null,
      })),
  );
});
