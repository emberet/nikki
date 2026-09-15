import { HttpError } from "./http";
export function releaseMode() {
  return (
    process.env.RELEASE_MODE ||
    (process.env.NODE_ENV === "production" ? "closed" : "local")
  );
}
export function isFounder(wallet: string) {
  return (
    releaseMode() === "founder" &&
    !!process.env.FOUNDER_WALLET &&
    wallet === process.env.FOUNDER_WALLET
  );
}
export function assertNewUploadsAllowed(wallet: string) {
  if (releaseMode() === "local") return;
  if (process.env.UPLOADS_ENABLED !== "true")
    throw new HttpError(503, "New submissions are not open yet.");
  if (releaseMode() === "founder") {
    if (!isFounder(wallet))
      throw new HttpError(
        403,
        "This launch accepts only the founder’s first video. Public submissions open after the token launch.",
      );
    return;
  }
  if (
    releaseMode() !== "community" ||
    process.env.VOTING_ENABLED !== "true" ||
    !process.env.TOKEN_MINT ||
    !process.env.TREASURY_WALLET_HASH ||
    !process.env.X_CLIENT_ID ||
    !process.env.X_CLIENT_SECRET
  )
    throw new HttpError(503, "Community submissions are not open yet.");
}
export function requireFounder(wallet: string) {
  if (!isFounder(wallet))
    throw new HttpError(
      403,
      "Only the configured founder can publish the founding record.",
    );
}
