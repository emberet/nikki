import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "buffer";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
} from "@solana/spl-token";
import { bondingCurvePda, PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";
import {
  resolveCommunityToken,
  safeCommunityUrl,
} from "../creator-worker/community-token";
import type { Env } from "../creator-worker/types";

const METADATA_PROGRAM = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const RPC = "https://rpc.example.com/solana";
const URI = "https://arweave.net/" + "a".repeat(43);
const env = { RPC_URL: RPC } as Env;
const u32 = (value: number) => {
  const result = Buffer.alloc(4);
  result.writeUInt32LE(value);
  return result;
};
const string = (value: string) =>
  Buffer.concat([u32(Buffer.byteLength(value)), Buffer.from(value)]);

function metadataBytes(
  mint: PublicKey,
  authority: PublicKey,
  options: {
    uri?: string;
    creators?: { key: PublicKey; verified: boolean }[];
    standard?: number;
  } = {},
) {
  return Buffer.concat([
    Buffer.from([4]),
    authority.toBuffer(),
    mint.toBuffer(),
    string("Existing token\0"),
    string("OLD\0"),
    string(options.uri ?? URI),
    Buffer.alloc(2),
    options.creators
      ? Buffer.concat([
          Buffer.from([1]),
          u32(options.creators.length),
          ...options.creators.map((c) =>
            Buffer.concat([
              c.key.toBuffer(),
              Buffer.from([Number(c.verified), 100]),
            ]),
          ),
        ])
      : Buffer.from([0]),
    Buffer.from([0, 1, 0, 1, options.standard ?? 2]),
  ]);
}

function fixture() {
  const mint = Keypair.generate().publicKey;
  const actor = Keypair.generate().publicKey;
  const authority = Keypair.generate().publicKey;
  const metadataPda = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM,
  )[0];
  const accounts = new Map<string, any>();
  const calls: { url: string; method: string; params: any[] }[] = [];
  let amount = "0";
  let genesis = GENESIS;
  let extra: unknown = {
    name: "Spoofed offchain name",
    symbol: "FAKE",
    description: "Bring our people together.",
    image: "ipfs://" + "Qm" + "b".repeat(44),
    website: "https://token.example.com/",
    twitter: "https://x.com/existingtoken",
    telegram: "https://t.me/existingtoken",
    creator: actor.toBase58(),
  };
  let offchain: ((init?: RequestInit, url?: string) => Response) | undefined;
  let metadataUrls = [URI];
  function account(key: PublicKey, owner: PublicKey, data: Buffer) {
    accounts.set(key.toBase58(), {
      data: [data.toString("base64"), "base64"],
      owner: owner.toBase58(),
      lamports: 1000000,
      executable: false,
      rentEpoch: 0,
    });
  }
  function mintAccount(
    options: {
      program?: PublicKey;
      supply?: bigint;
      decimals?: number;
      initialized?: boolean;
      tlv?: Buffer;
    } = {},
  ) {
    const bytes = Buffer.alloc(
      options.tlv ? 166 + 4 + options.tlv.length : MintLayout.span,
    );
    MintLayout.encode(
      {
        mintAuthorityOption: 1,
        mintAuthority: actor,
        supply: options.supply ?? 1000000000n,
        decimals: options.decimals ?? 6,
        isInitialized: options.initialized ?? true,
        freezeAuthorityOption: 0,
        freezeAuthority: PublicKey.default,
      },
      bytes,
    );
    if (options.tlv) {
      bytes[165] = 1;
      bytes.writeUInt16LE(ExtensionType.TokenMetadata, 166);
      bytes.writeUInt16LE(options.tlv.length, 168);
      options.tlv.copy(bytes, 170);
    }
    account(mint, options.program ?? TOKEN_PROGRAM_ID, bytes);
  }
  mintAccount();
  account(metadataPda, METADATA_PROGRAM, metadataBytes(mint, authority));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (url !== RPC) {
      calls.push({ url, method: "GET", params: [] });
      assert.ok(
        metadataUrls.includes(url),
        "Only exact allowed metadata URLs may be fetched",
      );
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal instanceof AbortSignal);
      return offchain ? offchain(init, url) : Response.json(extra);
    }
    const request = JSON.parse(String(init?.body));
    calls.push({ url, method: request.method, params: request.params });
    let result;
    if (request.method === "getGenesisHash") result = genesis;
    else if (request.method === "getAccountInfo") {
      assert.equal(request.params[1].commitment, "finalized");
      result = {
        context: { slot: 100 },
        value: accounts.get(request.params[0]) ?? null,
      };
    } else if (request.method === "getTokenAccountsByOwner") {
      assert.equal(request.params[0], actor.toBase58());
      assert.equal(request.params[1].mint, mint.toBase58());
      assert.equal(request.params[2].commitment, "finalized");
      result = {
        context: { slot: 100 },
        value:
          amount === "0"
            ? []
            : [
                {
                  pubkey: Keypair.generate().publicKey.toBase58(),
                  account: {
                    owner: TOKEN_PROGRAM_ID.toBase58(),
                    executable: false,
                    lamports: 1000000,
                    rentEpoch: 0,
                    data: {
                      program: "spl-token",
                      parsed: {
                        type: "account",
                        info: {
                          owner: actor.toBase58(),
                          mint: mint.toBase58(),
                          tokenAmount: {
                            amount,
                            decimals: 6,
                            uiAmount: 0.000001,
                          },
                        },
                      },
                      space: 165,
                    },
                  },
                },
              ],
      };
    } else throw Error("Unexpected RPC method: " + request.method);
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  }) as typeof fetch;
  return {
    mint,
    actor,
    authority,
    metadataPda,
    accounts,
    account,
    mintAccount,
    calls,
    setAmount: (value: string) => {
      amount = value;
    },
    setGenesis: (value: string) => {
      genesis = value;
    },
    setExtra: (value: unknown) => {
      extra = value;
    },
    setMetadataUrls: (value: string[]) => {
      metadataUrls = value;
    },
    setOffchain: (value: (init?: RequestInit, url?: string) => Response) => {
      offchain = value;
    },
    run: () => resolveCommunityToken(env, mint.toBase58(), actor.toBase58()),
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

test("imports existing SPL identity and links; only positive finalized holdings establish member eligibility", async () => {
  const f = fixture();
  try {
    f.setAmount("1");
    const result = await f.run();
    assert.equal(result.name, "Existing token");
    assert.equal(result.symbol, "OLD");
    assert.equal(result.description, "Bring our people together.");
    assert.ok(result.logoUrl.startsWith("https://ipfs.io/ipfs/Qm"));
    assert.equal(result.websiteUrl, "https://token.example.com/");
    assert.equal(result.xUrl, "https://x.com/existingtoken");
    assert.equal(result.telegramUrl, "https://t.me/existingtoken");
    assert.equal(result.actorIsHolder, true);
    assert.equal(
      result.actorIsAuthority,
      false,
      "Mint authority and untrusted JSON creator are not creator proofs",
    );
    assert.equal(result.authorityWallet, f.authority.toBase58());
    assert.equal(result.authorityKind, "metadata_update_authority");
    f.setAmount("0");
    assert.equal((await f.run()).actorIsHolder, false);
  } finally {
    f.restore();
  }
});

test("recognizes signed Metaplex creators but rejects unverified creator entries", async () => {
  const f = fixture();
  try {
    for (const verified of [false, true]) {
      f.account(
        f.metadataPda,
        METADATA_PROGRAM,
        metadataBytes(f.mint, f.authority, {
          creators: [{ key: f.actor, verified }],
        }),
      );
      const result = await f.run();
      assert.equal(result.actorIsAuthority, verified);
      if (verified) {
        assert.equal(result.authorityKind, "verified_metadata_creator");
        assert.equal(result.authorityWallet, f.actor.toBase58());
      }
    }
  } finally {
    f.restore();
  }
});

test("recognizes actual Metaplex update authority without requiring token holdings", async () => {
  const f = fixture();
  try {
    f.account(f.metadataPda, METADATA_PROGRAM, metadataBytes(f.mint, f.actor));
    const result = await f.run();
    assert.equal(result.actorIsAuthority, true);
    assert.equal(result.actorIsHolder, false);
    assert.equal(result.authorityKind, "metadata_update_authority");
  } finally {
    f.restore();
  }
});

test("imports Token-2022 metadata and verifies its update authority", async () => {
  const f = fixture();
  try {
    f.accounts.delete(f.metadataPda.toBase58());
    const tlv = Buffer.concat([
      f.actor.toBuffer(),
      f.mint.toBuffer(),
      string("New token"),
      string("NEW"),
      string(URI),
      u32(0),
    ]);
    f.mintAccount({ program: TOKEN_2022_PROGRAM_ID, tlv });
    const result = await f.run();
    assert.equal(result.name, "New token");
    assert.equal(result.symbol, "NEW");
    assert.equal(result.actorIsAuthority, true);
    assert.equal(result.authorityKind, "token_metadata_update_authority");
  } finally {
    f.restore();
  }
});

test("Pump creator proof requires the canonical PDA, Pump owner and account discriminator", async () => {
  const f = fixture();
  try {
    const curve = Buffer.alloc(151);
    Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]).copy(curve);
    f.actor.toBuffer().copy(curve, 49);
    const pda = bondingCurvePda(f.mint);
    f.account(pda, TOKEN_PROGRAM_ID, curve);
    assert.equal((await f.run()).actorIsAuthority, false);
    f.account(pda, PUMP_PROGRAM_ID, curve);
    const result = await f.run();
    assert.equal(result.actorIsAuthority, true);
    assert.equal(result.authorityKind, "pump_creator");
    curve[0] = 0;
    f.account(pda, PUMP_PROGRAM_ID, curve);
    assert.equal((await f.run()).actorIsAuthority, false);
  } finally {
    f.restore();
  }
});

test("does not trust spoofed metadata owners, mismatched mints or truncated Borsh data", async () => {
  const f = fixture();
  try {
    for (const [owner, data] of [
      [TOKEN_PROGRAM_ID, metadataBytes(f.mint, f.actor)],
      [METADATA_PROGRAM, metadataBytes(Keypair.generate().publicKey, f.actor)],
      [METADATA_PROGRAM, Buffer.from([4, 0])],
    ] as const) {
      f.account(f.metadataPda, owner, data);
      const result = await f.run();
      assert.equal(result.actorIsAuthority, false);
      assert.equal(result.authorityWallet, null);
      assert.equal(result.name, "");
      assert.ok(
        result.warnings.some((w) => w.includes("could not be verified")),
      );
    }
  } finally {
    f.restore();
  }
});

test("rejects non-mints, zero supply, uninitialized mints and identified NFTs", async () => {
  const f = fixture();
  try {
    f.mintAccount({ supply: 0n });
    await assert.rejects(f.run(), /supply/);
    f.mintAccount({ initialized: false });
    await assert.rejects(f.run(), /initialized/);
    f.mintAccount({ supply: 1n, decimals: 0 });
    f.account(
      f.metadataPda,
      METADATA_PROGRAM,
      metadataBytes(f.mint, f.authority, { standard: 0 }),
    );
    await assert.rejects(f.run(), /not NFTs/);
    f.accounts.delete(f.metadataPda.toBase58());
    await assert.rejects(f.run(), /not NFTs/);
    f.account(f.mint, TOKEN_PROGRAM_ID, Buffer.alloc(165));
    await assert.rejects(f.run(), /valid Solana token mint/);
    f.accounts.delete(f.mint.toBase58());
    await assert.rejects(f.run(), /deployed Solana token mint/);
  } finally {
    f.restore();
  }
});

test("checks configured RPC is mainnet before importing any token", async () => {
  const f = fixture();
  try {
    f.setGenesis("EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
    await assert.rejects(f.run(), /not on mainnet/);
    assert.equal(f.calls.length, 1);
  } finally {
    f.restore();
  }
});

test("does not request arbitrary metadata hosts and leaves manual fallback warnings", async () => {
  const f = fixture();
  try {
    for (const uri of [
      "https://token.example.com/meta.json",
      "http://127.0.0.1/admin",
      "https://arweave.net.evil.com/" + "a".repeat(43),
      "https://arweave.net/redirect?url=https://localhost",
    ]) {
      f.account(
        f.metadataPda,
        METADATA_PROGRAM,
        metadataBytes(f.mint, f.authority, { uri }),
      );
      const result = await f.run();
      assert.equal(result.description, "");
      assert.ok(result.warnings.some((w) => w.includes("not supported")));
    }
    assert.ok(f.calls.every((c) => c.url === RPC));
  } finally {
    f.restore();
  }
});

test("oversized and invalid offchain JSON safely falls back to checked on-chain identity", async () => {
  const f = fixture();
  try {
    for (const response of [
      () => new Response("{}", { headers: { "content-length": "100000" } }),
      () => new Response("a".repeat(65537)),
      () => new Response("<html>not metadata</html>"),
      () => Response.json(["invalid"]),
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://localhost/" },
        }),
    ]) {
      f.setOffchain(response);
      const result = await f.run();
      assert.equal(result.name, "Existing token");
      assert.equal(result.description, "");
      assert.ok(result.warnings.some((w) => w.includes("could not be loaded")));
    }
  } finally {
    f.restore();
  }
});

test("untrusted links and social lookalikes are removed from imported metadata", async () => {
  const f = fixture();
  try {
    f.setExtra({
      image: "javascript:alert(1)",
      website: "https://user:secret@example.com",
      twitter: "https://x.com.evil.com/user",
      telegram: "https://127.0.0.1/",
      description: "\u202eSafe\0 text",
    });
    const result = await f.run();
    assert.equal(result.logoUrl, "");
    assert.equal(result.websiteUrl, "");
    assert.equal(result.xUrl, "");
    assert.equal(result.telegramUrl, "");
    assert.equal(result.description, "Safe text");
  } finally {
    f.restore();
  }
});

test("an unavailable IPFS gateway retries the identical CID once at a fixed gateway", async () => {
  const f = fixture();
  try {
    const path = "/ipfs/" + "bafkrei" + "a".repeat(52);
    const primary = "https://ipfs.io" + path;
    const fallback = "https://gateway.pinata.cloud" + path;
    f.account(
      f.metadataPda,
      METADATA_PROGRAM,
      metadataBytes(f.mint, f.authority, { uri: primary }),
    );
    f.setMetadataUrls([primary, fallback]);
    f.setOffchain((_init, url) =>
      url === primary
        ? new Response(null, { status: 429 })
        : Response.json({ description: "Same content, available gateway." }),
    );
    const result = await f.run();
    assert.equal(result.description, "Same content, available gateway.");
    assert.equal(
      result.metadataUri,
      primary,
      "Retain the token's metadata reference",
    );
    assert.deepEqual(
      f.calls.filter((c) => c.method === "GET").map((c) => c.url),
      [primary, fallback],
    );
    assert.ok(!result.warnings.some((w) => w.includes("could not be loaded")));
    f.setOffchain(() => new Response(null, { status: 429 }));
    const unavailable = await f.run();
    assert.equal(unavailable.name, "Existing token");
    assert.ok(
      unavailable.warnings.some((w) => w.includes("could not be loaded")),
    );
    assert.equal(
      f.calls.filter((c) => c.method === "GET").length,
      4,
      "At most two attempts per import",
    );
  } finally {
    f.restore();
  }
});

test("public URL sanitizer blocks local, credentialed, numeric and alternate-port URLs", () => {
  for (const value of [
    "http://example.com",
    "//example.com",
    "javascript:alert(1)",
    "https://localhost/",
    "https://foo.local/",
    "https://10.0.0.1/",
    "https://127.1/",
    "https://2130706433/",
    "https://[::1]/",
    "https://user:pass@example.com/",
    "https://example.com:8080/",
    "https://example.com\\@localhost/",
    "https://exam\nple.com/",
    "https://internal/",
    "data:image/svg+xml,<svg/>",
  ]) {
    assert.equal(safeCommunityUrl(value), "", value);
  }
  assert.equal(
    safeCommunityUrl("https://example.com/path"),
    "https://example.com/path",
  );
  assert.equal(safeCommunityUrl("ar://" + "a".repeat(43)), URI);
});
