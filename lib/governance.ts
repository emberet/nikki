import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { db } from "./db";
import { HttpError } from "./http";
import { qualifies, VOTING_MS, voteResult } from "./rules";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export async function createEligibilitySnapshot() {
  if (process.env.RELEASE_MODE === "founder")
    throw new HttpError(503, "Community voting opens after the token launch.");
  const mint = process.env.TOKEN_MINT,
    rpc = process.env.RPC_URL,
    excludedHash = process.env.TREASURY_WALLET_HASH;
  if (process.env.VOTING_ENABLED !== "true" || !mint || !rpc || !excludedHash)
    throw new HttpError(
      503,
      "Community voting is not open yet. Your submission can wait safely in the studio.",
    );
  if (!/^[a-f0-9]{64}$/.test(excludedHash))
    throw new HttpError(503, "Voting configuration is incomplete.");
  try {
    new PublicKey(mint);
  } catch {
    throw new HttpError(503, "The NIKKI token has not been configured.");
  }
  const call = async (method: string, params: unknown[]) => {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new HttpError(
        503,
        "The eligibility snapshot is temporarily unavailable.",
      );
    const result = await response.json();
    if (result.error || !result.result)
      throw new HttpError(
        503,
        "The eligibility snapshot is temporarily unavailable.",
      );
    return result.result;
  };
  // A single finalized response holds every SPL token account for the mint.
  const mintResult = await call("getAccountInfo", [
    mint,
    { encoding: "jsonParsed", commitment: "finalized" },
  ]);
  const info = mintResult.value?.data?.parsed?.info;
  if (
    mintResult.value?.owner !== TOKEN_PROGRAM ||
    !info ||
    !Number.isInteger(info.decimals) ||
    info.decimals < 0 ||
    info.decimals > 18 ||
    !/^\d+$/.test(info.supply)
  )
    throw new HttpError(
      503,
      "This pilot requires a standard Solana SPL token mint.",
    );
  const supply = BigInt(info.supply);
  if (supply <= 0n || supply > 1_000_000_000n * 10n ** BigInt(info.decimals))
    throw new HttpError(
      503,
      "The token supply exceeds the agreed maximum or is empty.",
    );
  const snapshot = await call("getProgramAccounts", [
    TOKEN_PROGRAM,
    {
      encoding: "jsonParsed",
      commitment: "finalized",
      withContext: true,
      minContextSlot: mintResult.context.slot,
      filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
    },
  ]);
  if (
    !Number.isSafeInteger(snapshot.context?.slot) ||
    !Array.isArray(snapshot.value)
  )
    throw new HttpError(
      503,
      "The RPC did not provide a complete eligibility snapshot.",
    );
  const owners = new Map<string, bigint>(),
    seen = new Set<string>();
  for (const row of snapshot.value) {
    const a = row.account?.data?.parsed?.info;
    if (
      !a ||
      a.mint !== mint ||
      typeof a.owner !== "string" ||
      !/^\d+$/.test(a.tokenAmount?.amount || "") ||
      a.tokenAmount.decimals !== info.decimals ||
      seen.has(row.pubkey)
    )
      throw new HttpError(503, "The token snapshot could not be verified.");
    seen.add(row.pubkey);
    owners.set(
      a.owner,
      (owners.get(a.owner) || 0n) + BigInt(a.tokenAmount.amount),
    );
  }
  // Refuse partial/truncated mint account scans instead of silently missing voters.
  if ([...owners.values()].reduce((sum, n) => sum + n, 0n) !== supply)
    throw new HttpError(
      503,
      "The token snapshot is incomplete. Please try again.",
    );
  const users = await db.user.findMany({ where: { xId: { not: null } } });
  const members = users
    .filter(
      (u) =>
        u.xId &&
        u.xUsername &&
        qualifies(owners.get(u.wallet) || 0n, info.decimals) &&
        createHash("sha256").update(u.wallet).digest("hex") !== excludedHash,
    )
    .map((u) => ({
      wallet: u.wallet,
      amount: (owners.get(u.wallet) || 0n).toString(),
      xId: u.xId!,
      xUsername: u.xUsername!,
    }))
    .sort((a, b) => a.wallet.localeCompare(b.wallet));
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        slot: snapshot.context.slot,
        mint,
        decimals: info.decimals,
        members,
      }),
    )
    .digest("hex");
  return {
    slot: BigInt(snapshot.context.slot),
    mint,
    decimals: info.decimals,
    hash,
    members,
  };
}
export async function openElection(videoId: string, creatorId: string) {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (
    !video ||
    video.creatorId !== creatorId ||
    video.status !== "snapshot_pending" ||
    !video.sha256
  )
    throw new HttpError(409, "This submission is not ready to open voting.");
  const snapshot = await createEligibilitySnapshot(),
    now = new Date();
  await db.$transaction(async (tx) => {
    const claim = await tx.video.updateMany({
      where: { id: videoId, status: "snapshot_pending" },
      data: {
        status: "voting",
        voteOpensAt: now,
        voteClosesAt: new Date(now.getTime() + VOTING_MS),
        snapshotSlot: snapshot.slot,
        snapshotHash: snapshot.hash,
        snapshotMint: snapshot.mint,
        snapshotDecimals: snapshot.decimals,
      },
    });
    if (claim.count !== 1)
      throw new HttpError(409, "Voting has already opened.");
    if (snapshot.members.length)
      await tx.eligibleVoter.createMany({
        data: snapshot.members.map((m) => ({ ...m, videoId })),
      });
  });
}
export async function finalizeElection(videoId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const video = await tx.video.findUnique({ where: { id: videoId } });
    if (
      !video ||
      video.status !== "voting" ||
      !video.voteClosesAt ||
      video.voteClosesAt > now
    )
      return video;
    const [yes, no] = await Promise.all([
      tx.ballot.count({ where: { videoId, choice: "yes" } }),
      tx.ballot.count({ where: { videoId, choice: "no" } }),
    ]);
    const status = voteResult(yes, no);
    await tx.video.updateMany({
      where: { id: videoId, status: "voting", finalizedAt: null },
      data: { status, yesCount: yes, noCount: no, finalizedAt: now },
    });
    return tx.video.findUnique({ where: { id: videoId } });
  });
}
export async function closeDueElections() {
  const due = await db.video.findMany({
    where: { status: "voting", voteClosesAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const video of due) await finalizeElection(video.id);
}
export function ballotMessage(
  v: {
    id: string;
    sha256: string | null;
    snapshotHash: string | null;
    voteClosesAt: Date | null;
  },
  wallet: string,
  xId: string,
  choice: string,
  reason: string,
  issuedAt: string,
) {
  return [
    "Nikki publication vote",
    "Proposal: " + v.id,
    "File SHA-256: " + v.sha256,
    "Eligibility snapshot: " + v.snapshotHash,
    "Closes: " + v.voteClosesAt?.toISOString(),
    "Wallet: " + wallet,
    "X account ID: " + xId,
    "Choice: " + choice,
    "Reason: " + reason,
    "Issued: " + issuedAt,
    "I personally approve or reject publication of this exact record.",
  ].join("\n");
}
