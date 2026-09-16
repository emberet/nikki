import type { FounderRecord, User, Video } from "@prisma/client";
import { communitiesDrop } from "./communities-drop";
import { HttpError } from "./http";
import { publicRecord } from "./public-record";

export type FounderReleaseSlot = "founding-record" | "creator-drop-002";
export type FounderSubmission = Video & {
  founderReleaseSlot: FounderReleaseSlot;
};

type FoundingPublication = FounderRecord & {
  video: Video & { creator: User };
};

// This exception authorizes one prepared film, not an open-ended bypass of
// community review. Every field preserved in its signed archive must match.
export function isCommunitiesDrop(video: Video) {
  return (
    video.title === communitiesDrop.title &&
    video.description === communitiesDrop.description &&
    video.category === communitiesDrop.category &&
    video.language === communitiesDrop.language &&
    video.recordedAt === null &&
    video.source === communitiesDrop.source &&
    video.mimeType === communitiesDrop.mimeType &&
    video.sizeBytes === BigInt(communitiesDrop.sizeBytes) &&
    video.sha256 === communitiesDrop.sha256
  );
}

export function founderReleaseSlot(
  video: Video,
  wallet: string,
  founding: FoundingPublication | null,
  second: { id: string } | null,
): FounderReleaseSlot {
  if (!founding) {
    if (second)
      throw new HttpError(
        409,
        "The founder publication state is inconsistent.",
      );
    if (isCommunitiesDrop(video))
      throw new HttpError(
        409,
        "The founding record must be verified and published before creator drop 002.",
      );
    return "founding-record";
  }

  try {
    if (
      founding.id !== "founding-record" ||
      founding.videoId !== founding.video.id ||
      founding.video.id === video.id
    )
      throw Error("Invalid founding reservation");
    // A published state alone is insufficient: also validate the original
    // signed archive and both permanent identifiers, without changing it.
    publicRecord({ ...founding.video, founderRecord: founding }, wallet);
  } catch {
    throw new HttpError(
      409,
      "The founding record must be verified and published before creator drop 002.",
    );
  }
  if (!isCommunitiesDrop(video))
    throw new HttpError(
      409,
      "Only the exact prepared Communities film is approved for creator drop 002.",
    );
  if (second)
    throw new HttpError(
      409,
      "Creator drop 002 has already been reserved or published.",
    );
  return "creator-drop-002";
}
