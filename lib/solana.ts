import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import fs from "fs";

export function connection() {
  return new Connection(process.env.RPC_URL!, "confirmed");
}

export function treasuryKeypair(): Keypair {
  const raw = JSON.parse(
    fs.readFileSync(process.env.TREASURY_KEYPAIR_PATH!, "utf8")
  );
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function treasuryPubkey(): PublicKey {
  const env = process.env.NEXT_PUBLIC_TREASURY_WALLET;
  if (env) return new PublicKey(env);
  return treasuryKeypair().publicKey;
}

/**
 * Verify a payment tx: confirmed, transfers >= expected lamports (SOL) or
 * token base units to the treasury, signed by payer.
 */
export async function verifyPayment(opts: {
  signature: string;
  payer: string;
  expectedLamports: bigint;
  currency: "SOL" | "TOKEN";
}): Promise<boolean> {
  const conn = connection();
  const tx = await conn.getParsedTransaction(opts.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx || tx.meta?.err) return false;

  const treasury = treasuryPubkey().toBase58();
  const keys = tx.transaction.message.accountKeys;
  const signerOk = keys.some((k) => k.signer && k.pubkey.toBase58() === opts.payer);
  if (!signerOk) return false;

  if (opts.currency === "SOL") {
    const idx = keys.findIndex((k) => k.pubkey.toBase58() === treasury);
    if (idx === -1) return false;
    const received =
      BigInt(tx.meta!.postBalances[idx]) - BigInt(tx.meta!.preBalances[idx]);
    return received >= opts.expectedLamports;
  }

  // TOKEN: compare treasury-owned token balance delta for the platform mint
  const mint = process.env.TOKEN_MINT;
  if (!mint) return false;
  const pre = tx.meta?.preTokenBalances || [];
  const post = tx.meta?.postTokenBalances || [];
  const sum = (arr: typeof pre) =>
    arr
      .filter((b) => b.mint === mint && b.owner === treasury)
      .reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(post) - sum(pre) >= opts.expectedLamports;
}

export async function tokenBalance(owner: string): Promise<bigint> {
  const mint = process.env.TOKEN_MINT;
  if (!mint) return 0n;
  const conn = connection();
  const res = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), {
    mint: new PublicKey(mint),
  });
  return res.value.reduce(
    (a, acc) => a + BigInt(acc.account.data.parsed.info.tokenAmount.amount),
    0n
  );
}

/** Refund SOL from treasury (rejection path). Returns tx signature. */
export async function refundSol(to: string, lamports: bigint): Promise<string> {
  if (lamports <= 0n) throw new Error("nothing to refund");
  const conn = connection();
  const kp = treasuryKeypair();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: new PublicKey(to),
      lamports: Number(lamports),
    })
  );
  const sig = await conn.sendTransaction(tx, [kp]);
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

export const SOL = LAMPORTS_PER_SOL;
