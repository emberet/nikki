import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { HttpError } from "@/lib/http";
import { fileResponse } from "@/lib/uploads";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireUser();
    const video = await db.video.findUnique({
      where: { id },
      include: { eligibleVoters: { where: { wallet: user.wallet } } },
    });
    if (
      !video ||
      !video.filePath ||
      (video.creatorId !== user.id &&
        !video.eligibleVoters.some((m) => m.xId === user.xId))
    )
      throw new HttpError(404, "Preview unavailable.");
    return fileResponse(req, video.filePath, video.mimeType);
  } catch (e) {
    return Response.json(
      { error: "Preview unavailable." },
      {
        status: e instanceof Error && e.message === "unauthorized" ? 401 : 404,
      },
    );
  }
}
