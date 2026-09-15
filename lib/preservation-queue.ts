import { db } from "./db";
// Rotate attempted jobs durably, including provider delays and funding failures.
export async function nextPreservationBatch(limit = 5) {
  return db.$transaction(async (tx) => {
    const jobs = await tx.video.findMany({
      where: { status: { in: ["publish_queued", "publishing"] } },
      orderBy: [{ publishClaimedAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    if (jobs.length)
      await tx.video.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: { publishClaimedAt: new Date() },
      });
    return jobs;
  });
}
