import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getTokenMetadata,
  unpackMint,
} from "@solana/spl-token";
import { bondingCurvePda, PUMP_PROGRAM_ID, PUMP_SDK } from "@pump-fun/pump-sdk";
import { checkMainnet, connection, holdings } from "./chain";
import { ApiError, wallet } from "./common";
import type { Env } from "./types";

const METADATA_PROGRAM = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const MAX_JSON_BYTES = 64 * 1024;
const ZERO = PublicKey.default.toBase58();

export interface CommunityTokenImport {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  xUrl: string;
  telegramUrl: string;
  metadataUri: string;
  authorityWallet: string | null;
  authorityKind: string | null;
  actorIsAuthority: boolean;
  actorIsHolder: boolean;
  warnings: string[];
}

function clean(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
        .trim()
        .slice(0, maximum)
    : "";
}

/** Display links only. Server requests additionally require metadataFetchUrl. */
export function safeCommunityUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  let input = value.trim();
  if (/[\u0000-\u0020\u007f\\]/.test(input)) return "";
  if (/^ipfs:\/\/(?:ipfs\/)?[A-Za-z0-9]{32,120}(?:\/[^?#]*)?$/.test(input))
    input =
      "https://ipfs.io/ipfs/" + input.replace(/^ipfs:\/\/(?:ipfs\/)?/, "");
  if (/^ar:\/\/[A-Za-z0-9_-]{43}(?:\/[^?#]*)?$/.test(input))
    input = "https://arweave.net/" + input.slice(5);
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|onion)$/.test(host)
    )
      return "";
    return url.href;
  } catch {
    return "";
  }
}

function metadataFetchUrl(uri: string) {
  const safe = safeCommunityUrl(uri);
  if (!safe) return "";
  const url = new URL(safe);
  // Only content-addressed paths on fixed gateways are fetched by the worker.
  // Never follow arbitrary token-controlled URLs or HTTP redirects.
  if (url.search || url.hash) return "";
  if (
    url.hostname === "arweave.net" &&
    /^\/[A-Za-z0-9_-]{43}(?:\/[^%]*)?$/.test(url.pathname)
  )
    return safe;
  if (
    ["ipfs.io", "gateway.pinata.cloud", "cloudflare-ipfs.com"].includes(
      url.hostname,
    ) &&
    /^\/ipfs\/[A-Za-z0-9]{32,120}(?:\/[^%]*)?$/.test(url.pathname)
  )
    return safe;
  return "";
}

async function readMetadataJson(url: string) {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const timer = setTimeout(() => {
    controller.abort();
    void reader?.cancel();
  }, 8000);
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (
      !response.ok ||
      response.redirected ||
      !response.body ||
      Number(response.headers.get("content-length") || 0) > MAX_JSON_BYTES
    ) {
      void response.body?.cancel();
      throw Error("Metadata unavailable");
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const next = await reader.read();
      if (controller.signal.aborted) throw Error("Metadata timeout");
      if (next.done) break;
      length += next.value.length;
      if (length > MAX_JSON_BYTES) {
        await reader.cancel();
        throw Error("Metadata too large");
      }
      chunks.push(next.value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || Array.isArray(data) || typeof data !== "object")
      throw Error("Invalid metadata");
    return data as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
}

async function offchainMetadata(uri: string, warnings: string[]) {
  const url = metadataFetchUrl(uri);
  if (!url) {
    if (uri)
      warnings.push(
        "This metadata host is not supported for automatic import. Add any missing profile details manually.",
      );
    return {} as Record<string, unknown>;
  }
  const candidates = [url];
  const parsed = new URL(url);
  if (parsed.pathname.startsWith("/ipfs/")) {
    // Retry the same content identifier once, never a redirect destination.
    // Two eight-second attempts bound the entire metadata fetch to sixteen seconds.
    const gateway =
      parsed.hostname === "gateway.pinata.cloud"
        ? "ipfs.io"
        : "gateway.pinata.cloud";
    candidates.push(`https://${gateway}${parsed.pathname}`);
  }
  for (const candidate of candidates) {
    try {
      return await readMetadataJson(candidate);
    } catch {
      // Identity and eligibility are still independently checked on Solana.
    }
  }
  warnings.push(
    "The token's extra metadata could not be loaded. Its on-chain identity was still checked; add missing details manually.",
  );
  return {} as Record<string, unknown>;
}

interface Metadata {
  name: string;
  symbol: string;
  uri: string;
  authority: string | null;
  verifiedCreators: string[];
  tokenStandard: number | null;
}

// Borsh layout: Metaplex MetadataV1. Owner, discriminator and mint are all
// checked before trusting either metadata or recorded authority addresses.
// https://github.com/metaplex-foundation/mpl-token-metadata/blob/main/programs/token-metadata/program/src/state/metadata.rs
function decodeMetaplex(data: Buffer, mint: PublicKey): Metadata {
  let offset = 0;
  function take(count: number) {
    if (offset + count > data.length) throw Error("Truncated metadata");
    const value = data.subarray(offset, offset + count);
    offset += count;
    return value;
  }
  const byte = () => take(1)[0];
  function flag() {
    const value = byte();
    if (value > 1) throw Error("Invalid metadata option");
    return value === 1;
  }
  function string(maximum: number) {
    const length = take(4).readUInt32LE();
    if (length > maximum) throw Error("Invalid metadata string");
    return new TextDecoder("utf-8", { fatal: true }).decode(take(length));
  }
  if (byte() !== 4) throw Error("Invalid metadata discriminator");
  const authority = new PublicKey(take(32)).toBase58();
  if (!new PublicKey(take(32)).equals(mint))
    throw Error("Metadata mint mismatch");
  const name = string(32),
    symbol = string(10),
    uri = string(200);
  take(2); // Seller fee basis points.
  const verifiedCreators: string[] = [];
  if (flag()) {
    const count = take(4).readUInt32LE();
    if (count > 5) throw Error("Invalid metadata creators");
    for (let i = 0; i < count; i++) {
      const address = new PublicKey(take(32)).toBase58();
      const verified = flag();
      byte(); // Creator share.
      if (verified && address !== ZERO) verifiedCreators.push(address);
    }
  }
  flag(); // Primary sale happened.
  flag(); // Mutable metadata.
  if (offset < data.length && flag()) byte(); // Edition nonce.
  const tokenStandard = offset < data.length && flag() ? byte() : null;
  if (tokenStandard !== null && tokenStandard > 5)
    throw Error("Invalid token standard");
  return {
    name,
    symbol,
    uri,
    authority: authority === ZERO ? null : authority,
    verifiedCreators,
    tokenStandard,
  };
}

function social(value: unknown, hosts: string[]) {
  const safe = safeCommunityUrl(value);
  return safe && hosts.includes(new URL(safe).hostname.replace(/^www\./, ""))
    ? safe
    : "";
}

export async function resolveCommunityToken(
  env: Env,
  mintAddress: string,
  actorWallet?: string,
): Promise<CommunityTokenImport> {
  const mint = new PublicKey(wallet(mintAddress));
  const actor = actorWallet ? wallet(actorWallet) : undefined;
  const c = connection(env);
  await checkMainnet(c);
  const mintAccount = await c.getAccountInfo(mint, "finalized");
  if (
    !mintAccount ||
    mintAccount.executable ||
    ![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(
      mintAccount.owner.toBase58(),
    )
  )
    throw new ApiError(400, "Enter a deployed Solana token mint on mainnet.");
  let mintData;
  try {
    mintData = unpackMint(mint, mintAccount, mintAccount.owner);
  } catch {
    throw new ApiError(400, "This address is not a valid Solana token mint.");
  }
  if (!mintData.isInitialized || mintData.supply <= 0n)
    throw new ApiError(
      400,
      "This token must be initialized and have a non-zero supply.",
    );

  const metadataAddress = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM,
  )[0];
  const [metadataAccount, curveAccount, balances] = await Promise.all([
    c.getAccountInfo(metadataAddress, "finalized"),
    c.getAccountInfo(bondingCurvePda(mint), "finalized"),
    actor ? holdings(env, actor, mint.toBase58()) : Promise.resolve(null),
  ]);
  const warnings: string[] = [];
  const proofs: { wallet: string; kind: string }[] = [];
  let metadata: Metadata | null = null;
  if (metadataAccount) {
    try {
      if (
        !metadataAccount.owner.equals(METADATA_PROGRAM) ||
        metadataAccount.executable
      )
        throw Error("Wrong metadata owner");
      metadata = decodeMetaplex(metadataAccount.data, mint);
    } catch {
      warnings.push(
        "The Metaplex metadata could not be verified and was skipped.",
      );
    }
  }
  if (
    (metadata?.tokenStandard !== null &&
      metadata?.tokenStandard !== undefined &&
      ![1, 2].includes(metadata.tokenStandard)) ||
    (mintData.decimals === 0 &&
      mintData.supply === 1n &&
      ![1, 2].includes(metadata?.tokenStandard ?? -1))
  )
    throw new ApiError(
      400,
      "Communities currently support fungible tokens, not NFTs.",
    );

  if (curveAccount?.owner.equals(PUMP_PROGRAM_ID) && !curveAccount.executable) {
    try {
      const creator =
        PUMP_SDK.decodeBondingCurve(curveAccount).creator.toBase58();
      if (creator !== ZERO)
        proofs.push({ wallet: creator, kind: "pump_creator" });
    } catch {
      warnings.push("The pump.fun creator record could not be verified.");
    }
  }
  let name = clean(metadata?.name, 64),
    symbol = clean(metadata?.symbol, 20);
  let uri = clean(metadata?.uri, 2048);
  if (mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    // The SPL helper decodes the mint's TokenMetadata TLV extension, not a
    // caller-supplied metadata account or an arbitrary metadata pointer.
    const tokenMetadata = await getTokenMetadata(
      c,
      mint,
      "finalized",
      TOKEN_2022_PROGRAM_ID,
    );
    if (tokenMetadata) {
      if (!tokenMetadata.mint.equals(mint))
        throw new ApiError(
          400,
          "This token's metadata does not match its mint.",
        );
      name = clean(tokenMetadata.name, 64) || name;
      symbol = clean(tokenMetadata.symbol, 20) || symbol;
      uri = clean(tokenMetadata.uri, 2048) || uri;
      const authority = tokenMetadata.updateAuthority?.toBase58();
      if (authority && authority !== ZERO)
        proofs.push({
          wallet: authority,
          kind: "token_metadata_update_authority",
        });
    }
  }
  if (metadata?.authority)
    proofs.push({
      wallet: metadata.authority,
      kind: "metadata_update_authority",
    });
  for (const creator of metadata?.verifiedCreators || [])
    proofs.push({ wallet: creator, kind: "verified_metadata_creator" });

  const extra = await offchainMetadata(uri, warnings);
  const extensions =
    extra.extensions &&
    typeof extra.extensions === "object" &&
    !Array.isArray(extra.extensions)
      ? (extra.extensions as Record<string, unknown>)
      : {};
  const proof =
    proofs.find((candidate) => candidate.wallet === actor) || proofs[0];
  if (!name || !symbol)
    warnings.push(
      "This token has incomplete on-chain name or symbol metadata. Review its mint and fill in the missing profile details.",
    );
  if (!proof)
    warnings.push(
      "No supported on-chain creator or metadata authority was found. A token holder can start a clearly labelled community-led space.",
    );
  return {
    mint: mint.toBase58(),
    name,
    symbol,
    description: clean(extra.description, 1000),
    logoUrl: safeCommunityUrl(extra.image),
    websiteUrl: safeCommunityUrl(
      extra.website || extra.external_url || extensions.website,
    ),
    xUrl: social(
      extra.twitter || extra.x || extensions.twitter || extensions.x,
      ["x.com", "twitter.com"],
    ),
    telegramUrl: social(extra.telegram || extensions.telegram, [
      "t.me",
      "telegram.me",
    ]),
    metadataUri: safeCommunityUrl(uri),
    authorityWallet: proof?.wallet || null,
    authorityKind: proof?.kind || null,
    actorIsAuthority:
      !!actor && proofs.some((candidate) => candidate.wallet === actor),
    actorIsHolder: !!actor && (balances?.get(mint.toBase58()) || 0n) > 0n,
    warnings,
  };
}
