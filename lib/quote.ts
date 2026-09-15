import { HttpError } from "./http";
export function solToLamports(price: string) {
  // Turbo returns decimal SOL. Never convert currency through floating point.
  if (!/^\d+(?:\.\d{1,9})?$/.test(price))
    throw new HttpError(503, "A storage price is not available right now.");
  const [whole, fraction = ""] = price.split(".");
  const amount =
    BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new HttpError(503, "A valid SOL price is not available.");
  return amount;
}
export async function quoteLamports(sizes: number[]) {
  if (
    !sizes.length ||
    sizes.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 1_001_000_000)
  )
    throw new HttpError(400, "Invalid storage size.");
  const { TurboFactory } = await import("@ardrive/turbo-sdk/node");
  const turbo = TurboFactory.unauthenticated({ token: "solana" });
  const quotes = await Promise.all(
    sizes.map((byteCount) =>
      turbo.getTokenPriceForBytes({ byteCount: byteCount + 16384 }),
    ),
  );
  return quotes.reduce((total, q) => {
    if (q.token !== "solana")
      throw new HttpError(503, "Invalid storage currency.");
    return total + solToLamports(q.tokenPrice);
  }, 0n);
}
