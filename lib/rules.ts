export const MAX_UPLOAD_BYTES = 1_000_000_000;
export const CHUNK_BYTES = 8 * 1024 * 1024;
export const VOTING_MS = 24 * 60 * 60 * 1000;
export const MIN_VOTERS = 5;
export const TOKEN_THRESHOLD = 10_000_000n;
export function voteResult(yes: number, no: number) {
  if (
    !Number.isSafeInteger(yes) ||
    !Number.isSafeInteger(no) ||
    yes < 0 ||
    no < 0
  )
    throw new Error("Invalid vote count");
  if (yes + no < MIN_VOTERS) return "expired";
  return yes * 5 >= (yes + no) * 4 ? "approved" : "rejected";
}
export function qualifies(amount: bigint, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error("Invalid token decimals");
  return amount > TOKEN_THRESHOLD * 10n ** BigInt(decimals);
}
export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    uploading: "Uploading",
    expired_upload: "Temporary file expired",
    cleanup_pending: "Temporary file expiring",
    snapshot_pending: "Waiting for voting to open",
    voting: "Community voting",
    approved: "Approved · ready to preserve",
    publishing: "Preservation in progress",
    published: "Preserved",
    rejected: "Not approved",
    expired: "Not enough votes",
    payment_received: "Payment received",
    publish_queued: "Queued for preservation",
    publish_failed: "Needs publication recovery",
    awaiting_payment: "Legacy submission · contact support",
    in_review: "Legacy submission · contact support",
  };
  return labels[status] || status.replaceAll("_", " ");
}
