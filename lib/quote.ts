const IRYS_PRICE_URL = "https://uploader.irys.xyz/price/solana";

/** Lamports Irys charges to store `bytes` permanently, paid in SOL. */
export async function irysPriceLamports(bytes: number): Promise<bigint> {
  const r = await fetch(`${IRYS_PRICE_URL}/${bytes}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`irys price failed: ${r.status}`);
  return BigInt((await r.text()).trim());
}

export async function quoteLamports(bytes: number): Promise<bigint> {
  const raw = await irysPriceLamports(bytes);
  const margin = Number(process.env.FEE_MARGIN || "1.5");
  const quoted = (raw * BigInt(Math.round(margin * 1000))) / 1000n;
  // floor: never quote below rejection processing fee
  const floor = BigInt(process.env.REJECTION_FEE_LAMPORTS || "2000000");
  return quoted > floor ? quoted : floor;
}

/** Token-denominated quote: SOL quote with a 20% discount, converted 1:1 by
 * configured rate TOKEN_PER_SOL (base units per lamport numerator/denominator). */
export function tokenQuote(lamports: bigint): bigint {
  const rate = Number(process.env.TOKEN_PER_SOL || "0");
  if (!rate) return 0n;
  const discounted = (lamports * 80n) / 100n;
  return (discounted * BigInt(Math.round(rate * 1e6))) / 1000000n;
}
