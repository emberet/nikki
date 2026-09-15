import { db } from "@/lib/db";
import { api, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  const videos = await db.video.findMany({
    where: { status: "published", arweaveTx: { not: null } },
    include: { creator: { select: { wallet: true } } },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });
  return json(
    videos.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description,
      category: v.category,
      creator: v.creator.wallet,
      arweaveTx: v.arweaveTx,
      sizeBytes: v.sizeBytes.toString(),
      publishedAt: v.publishedAt,
    })),
  );
});
