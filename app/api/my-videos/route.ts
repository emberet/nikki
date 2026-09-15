import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { api, json } from "@/lib/http";
import { closeDueElections } from "@/lib/governance";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  const { user } = await requireUser();
  await closeDueElections();
  const videos = await db.video.findMany({
    where: { creatorId: user.id },
    include: { payment: true, ballots: { select: { choice: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json(
    videos.map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      sizeBytes: v.sizeBytes.toString(),
      arweaveTx: v.arweaveTx,
      sha256: v.sha256,
      createdAt: v.createdAt,
      voteClosesAt: v.voteClosesAt,
      yes: v.ballots.filter((b) => b.choice === "yes").length,
      no: v.ballots.filter((b) => b.choice === "no").length,
      paymentStatus: v.payment?.status,
      paymentSignature: v.payment?.txSignature,
      publicationError: v.publicationError,
    })),
  );
});
