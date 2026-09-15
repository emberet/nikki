export interface StorageRate {
  wincPerGiB: string;
  wincPerSol: string;
  updatedAt: string;
  expiresAt: string;
}

const GIB = 1_073_741_824n;
const LAMPORTS_PER_SOL = 1_000_000_000n;
const STORAGE_OVERHEAD = 16_384n;

function positiveInteger(value: string): bigint {
  if (typeof value !== "string" || !/^[1-9]\d{0,39}$/.test(value)) {
    throw new Error("Storage rate is unavailable.");
  }
  return BigInt(value);
}

/** Size-based guide, including an overhead allowance; never a payment quote. */
export function estimateStorageLamports(
  rate: StorageRate,
  bytes: number,
): bigint {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 1_000_000_000) {
    throw new RangeError("Choose a file size between 1 byte and 1 GB.");
  }
  const numerator =
    (BigInt(bytes) + STORAGE_OVERHEAD) *
    positiveInteger(rate.wincPerGiB) *
    LAMPORTS_PER_SOL;
  const denominator = GIB * positiveInteger(rate.wincPerSol);
  return (numerator + denominator - 1n) / denominator;
}

/** Keep four to six decimals without converting monetary integers to Number. */
export function formatStorageSol(lamports: bigint): string {
  if (lamports < 0n)
    throw new RangeError("Storage estimates cannot be negative.");
  if (lamports > 0n && lamports < 1_000n) return "<0.000001";
  const micros = (lamports + 500n) / 1_000n;
  const fraction = (micros % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0{1,2}$/, "");
  return `${micros / 1_000_000n}.${fraction}`;
}
