import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { HttpError } from "./http";
export function connection() {
  return new Connection(
    process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    "finalized",
  );
}
export function paymentRecipient() {
  const address = process.env.PAYMENT_WALLET;
  if (!address) throw new HttpError(503, "Storage payments are not open yet.");
  try {
    new PublicKey(address);
  } catch {
    throw new HttpError(503, "Storage payment configuration is incomplete.");
  }
  if (
    createHash("sha256").update(address).digest("hex") ===
    process.env.TREASURY_WALLET_HASH
  )
    throw new HttpError(503, "Use a separate operational payment wallet.");
  return address;
}
export function validPaymentTransaction(
  tx: any,
  opts: {
    payer: string;
    recipient: string;
    expectedLamports: bigint;
    reference: string;
    createdAt: Date;
    expiresAt: Date;
  },
) {
  if (!tx || !tx.meta || tx.meta.err || !tx.blockTime) return false;
  const blockMs = tx.blockTime * 1000;
  if (
    blockMs < opts.createdAt.getTime() - 1000 ||
    blockMs > opts.expiresAt.getTime()
  )
    return false;
  const keys = tx.transaction?.message?.accountKeys || [];
  if (!keys.some((k: any) => k.signer && String(k.pubkey) === opts.payer))
    return false;
  const instructions = tx.transaction?.message?.instructions || [];
  const memo = instructions.some(
    (ix: any) =>
      String(ix.programId) === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" &&
      ix.parsed === opts.reference,
  );
  if (!memo) return false;
  let sent = 0n;
  for (const ix of instructions) {
    if (
      String(ix.programId) !== SystemProgram.programId.toBase58() ||
      ix.parsed?.type !== "transfer"
    )
      continue;
    const info = ix.parsed.info;
    if (
      info.source === opts.payer &&
      info.destination === opts.recipient &&
      Number.isSafeInteger(info.lamports) &&
      info.lamports > 0
    )
      sent += BigInt(info.lamports);
  }
  return sent === opts.expectedLamports;
}
export async function verifyPayment(opts: {
  signature: string;
  payer: string;
  recipient: string;
  expectedLamports: bigint;
  reference: string;
  createdAt: Date;
  expiresAt: Date;
}) {
  const tx = await connection().getParsedTransaction(opts.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "finalized",
  });
  return validPaymentTransaction(tx, opts);
}
