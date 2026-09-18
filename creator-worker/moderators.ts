import type { Env } from "./types";
import { ApiError, hash, json, now } from "./common";
import { edgeCache } from "./cache";

// Moderator eligibility: wallets holding at least 1% of the $NIKKI supply.
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SNAPSHOT_KEY =
  "https://nikki.run/_internal/moderators/v1/mainnet/holders";

async function rpc(env: Env, method: string, params: unknown[]) {
  const response = await fetch(
    env.RPC_URL || "https://api.mainnet-beta.solana.com",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new ApiError(
      503,
      "The moderator list is temporarily unavailable. Please try again shortly.",
    );
  const result = (await response.json()) as { error?: unknown; result?: any };
  if (result.error || result.result === undefined)
    throw new ApiError(
      503,
      "The moderator list is temporarily unavailable. Please try again shortly.",
    );
  return result.result;
}

type Snapshot = {
  holders: [string, string][];
  supply: string;
  checkedAt: number;
};
async function holderSnapshot(env: Env, mint: string): Promise<Snapshot> {
  const cache = edgeCache(),
    key = new Request(SNAPSHOT_KEY + "/" + mint),
    hit = await cache?.match(key);
  if (hit) return (await hit.json()) as Snapshot;
  const supplyResult = await rpc(env, "getTokenSupply", [
    mint,
    { commitment: "finalized" },
  ]);
  const supplyRaw = supplyResult.value?.amount;
  if (
    typeof supplyRaw !== "string" ||
    !/^\d+$/.test(supplyRaw) ||
    supplyRaw === "0"
  )
    throw new ApiError(503, "The $NIKKI token supply could not be read.");
  const supply = BigInt(supplyRaw);
  const accounts = await rpc(env, "getProgramAccounts", [
    TOKEN_PROGRAM,
    {
      encoding: "jsonParsed",
      commitment: "finalized",
      filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
    },
  ]);
  if (!Array.isArray(accounts))
    throw new ApiError(503, "The $NIKKI holder snapshot could not be read.");
  const totals = new Map<string, bigint>();
  for (const entry of accounts) {
    const info = entry?.account?.data?.parsed?.info;
    const owner = info?.owner,
      amount = info?.tokenAmount?.amount;
    if (
      typeof owner !== "string" ||
      typeof amount !== "string" ||
      !/^\d+$/.test(amount)
    )
      continue;
    totals.set(owner, (totals.get(owner) || 0n) + BigInt(amount));
  }
  const holders: [string, string][] = [];
  for (const [wallet, amount] of totals)
    if (amount * 100n >= supply) holders.push([wallet, amount.toString()]);
  const snapshot: Snapshot = {
    holders,
    supply: supply.toString(),
    checkedAt: now(),
  };
  await cache
    ?.put(
      key,
      Response.json(snapshot, {
        headers: { "Cache-Control": "public,max-age=300" },
      }),
    )
    .catch(() => {});
  return snapshot;
}

export async function moderatorsApi(
  req: Request,
  env: Env,
  route: string,
): Promise<Response | null> {
  if (route !== "/moderators" || req.method !== "GET") return null;
  const mint = env.NIKKI_MINT;
  if (!mint) return json({ enabled: false, moderators: [], checkedAt: now() });
  const snapshot = await holderSnapshot(env, mint),
    supply = BigInt(snapshot.supply);
  const eligible: { wallet: string; amount: bigint }[] = [];
  for (const [wallet, amount] of snapshot.holders) {
    // The undisclosed treasury never gains or displays moderation power.
    if (
      env.TREASURY_WALLET_HASH &&
      (await hash(wallet)) === env.TREASURY_WALLET_HASH
    )
      continue;
    eligible.push({ wallet, amount: BigInt(amount) });
  }
  eligible.sort((a, b) =>
    a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1,
  );
  const channels = new Map<
    string,
    { handle: string; display_name: string; x_username: string | null }
  >();
  if (eligible.length) {
    const rows = await env.CREATORS_DB.prepare(
      `SELECT p.wallet,p.handle,p.display_name,u.x_username FROM creator_profiles p JOIN creator_users u ON u.wallet=p.wallet WHERE p.published=1 AND p.wallet IN (${eligible.map(() => "?").join(",")})`,
    )
      .bind(...eligible.map((h) => h.wallet))
      .all<{
        wallet: string;
        handle: string;
        display_name: string;
        x_username: string | null;
      }>();
    for (const row of rows.results) channels.set(row.wallet, row);
  }
  return json({
    enabled: true,
    mint,
    checkedAt: snapshot.checkedAt,
    moderators: eligible.map((holder) => {
      const channel = channels.get(holder.wallet);
      return {
        wallet: holder.wallet,
        percent: Number((holder.amount * 10000n) / supply) / 100,
        handle: channel?.handle || null,
        displayName: channel?.display_name || null,
        xUsername: channel?.x_username || null,
      };
    }),
  });
}
