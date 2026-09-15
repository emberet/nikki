import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getTokenMetadata,
  unpackMint,
  unpackAccount,
} from "@solana/spl-token";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  bondingCurvePda,
  computeFeesBps,
  getPumpProgram,
} from "@pump-fun/pump-sdk";
import { OnlinePumpAmmSdk, PUMP_AMM_SDK } from "@pump-fun/pump-swap-sdk";
import nacl from "tweetnacl";
import bs58 from "bs58";
import type { Env, CreatorToken, Intent } from "./types";
import { ApiError, hash, now, random } from "./common";

export function connection(env: Env) {
  return new Connection(env.RPC_URL || "https://api.mainnet-beta.solana.com", {
    commitment: "finalized",
    disableRetryOnRateLimit: true,
    fetch: (async (url, init) => {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new ApiError(
          503,
          "The Solana connection is unavailable or rate-limited. Please try again shortly.",
        );
      return response;
    }) as typeof fetch,
  });
}
export async function checkMainnet(c: Connection) {
  if (
    (await c.getGenesisHash()) !==
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  )
    throw new ApiError(503, "The Solana connection is not on mainnet.");
}
export async function nativeFeeInstructions(c: Connection, creator: PublicKey) {
  const instructions = [];
  // Pump's native SOL vault holds lamports; V2 collection is for token accounts.
  if (!(await new OnlinePumpSdk(c).getCreatorVaultBalance(creator)).isZero())
    instructions.push(
      await getPumpProgram(c)
        .methods.collectCreatorFee()
        .accountsPartial({ creator })
        .instruction(),
    );
  const state = await new OnlinePumpAmmSdk(c).collectCoinCreatorFeeSolanaState(
    creator,
    undefined,
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
  );
  const info = state.coinCreatorVaultAtaAccountInfo;
  // Do not create an empty AMM vault just to collect fees from the Pump leg.
  if (
    info?.owner.equals(TOKEN_PROGRAM_ID) &&
    unpackAccount(state.coinCreatorVaultAta, info, TOKEN_PROGRAM_ID).amount > 0n
  )
    instructions.push(
      ...(await PUMP_AMM_SDK.collectCoinCreatorFee(state, creator)),
    );
  return instructions;
}
export async function tokenIdentity(env: Env, token: CreatorToken) {
  const c = connection(env),
    mint = new PublicKey(token.mint),
    account = await c.getAccountInfo(mint, "finalized");
  if (!account) return null;
  if (!account.owner.equals(TOKEN_2022_PROGRAM_ID))
    throw new ApiError(409, "This is not the expected pump.fun token.");
  const mintData = unpackMint(mint, account, TOKEN_2022_PROGRAM_ID);
  if (mintData.decimals !== 6)
    throw new ApiError(409, "The token’s decimals do not match its launch.");
  const curveAddress = bondingCurvePda(mint),
    curveAccount = await c.getAccountInfo(curveAddress, "finalized");
  if (!curveAccount?.owner.equals(PUMP_PROGRAM_ID))
    throw new ApiError(409, "The pump.fun launch could not be verified.");
  const online = new OnlinePumpSdk(c),
    curve = await online.fetchBondingCurve(mint);
  if (
    !curve.creator.equals(new PublicKey(token.wallet)) ||
    curve.isHolderReward ||
    curve.isCashbackCoin ||
    curve.isMayhemMode ||
    ![PublicKey.default.toBase58(), NATIVE_MINT.toBase58()].includes(
      curve.quoteMint.toBase58(),
    ) ||
    mintData.supply > BigInt(curve.tokenTotalSupply.toString())
  )
    throw new ApiError(
      409,
      "The token’s creator or fee settings do not match this channel.",
    );
  const metadata = await getTokenMetadata(
    c,
    mint,
    "finalized",
    TOKEN_2022_PROGRAM_ID,
  );
  if (
    !metadata ||
    metadata.uri !== token.metadata_uri ||
    metadata.name !== token.name ||
    metadata.symbol !== token.symbol
  )
    throw new ApiError(
      409,
      "The token metadata does not match the confirmed launch draft.",
    );
  return { curve, online };
}
export async function holdings(env: Env, address: string) {
  const c = connection(env),
    owner = new PublicKey(address);
  const accounts = await Promise.all(
    [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) =>
      c.getParsedTokenAccountsByOwner(owner, { programId }, "finalized"),
    ),
  );
  const totals = new Map<string, bigint>();
  for (const group of accounts) {
    if (group.value.length > 20000)
      throw new ApiError(
        503,
        "This wallet needs an indexed balance lookup. Please try again later.",
      );
    for (const row of group.value) {
      const info = row.account.data.parsed?.info;
      if (
        info?.owner !== address ||
        typeof info.mint !== "string" ||
        !/^\d+$/.test(info.tokenAmount?.amount)
      )
        throw new ApiError(
          503,
          "The balance service returned an incomplete result.",
        );
      totals.set(
        info.mint,
        (totals.get(info.mint) || 0n) + BigInt(info.tokenAmount.amount),
      );
    }
  }
  return totals;
}
export async function feeSummary(env: Env, token: CreatorToken) {
  const verified = await tokenIdentity(env, token);
  if (!verified) throw new ApiError(503, "The token is awaiting confirmation.");
  const amount = await verified.online.getCreatorVaultBalanceBothPrograms(
    new PublicKey(token.wallet),
  );
  let creatorFeeBps: string | null = null;
  if (!verified.curve.complete) {
    const [global, feeConfig] = await Promise.all([
      verified.online.fetchGlobal(),
      verified.online.fetchFeeConfig(),
    ]);
    creatorFeeBps = computeFeesBps({
      global,
      feeConfig,
      mintSupply: verified.curve.tokenTotalSupply,
      virtualQuoteReserves: verified.curve.virtualQuoteReserves,
      virtualTokenReserves: verified.curve.virtualTokenReserves,
      quoteMint: verified.curve.quoteMint,
      creatorFeeBps: verified.curve.creatorFeeBps,
    }).creatorFeeBps.toString();
  }
  return {
    unclaimedLamports: amount.toString(),
    scope: "wallet",
    creatorFeeBps,
    graduated: verified.curve.complete,
    checkedAt: now(),
  };
}
export async function prepareIntent(
  env: Env,
  address: string,
  token: CreatorToken,
  kind: "launch" | "claim",
) {
  const c = connection(env);
  await checkMainnet(c);
  const existing = await env.CREATORS_DB.prepare(
    "SELECT * FROM creator_intents WHERE wallet=? AND kind=? AND status IN ('prepared','submitted') ORDER BY created_at DESC LIMIT 1",
  )
    .bind(address, kind)
    .first<Intent>();
  if (existing) {
    const height = await c.getBlockHeight("finalized");
    const status = existing.signature
      ? (
          await c.getSignatureStatuses([existing.signature], {
            searchTransactionHistory: true,
          })
        ).value[0]
      : null;
    if (status?.confirmationStatus === "finalized" && status.err) {
      await env.CREATORS_DB.prepare(
        "UPDATE creator_intents SET status='failed' WHERE id=?",
      )
        .bind(existing.id)
        .run();
    } else if (height <= existing.last_valid_height || status) {
      return {
        id: existing.id,
        transaction: existing.unsigned_tx,
        estimatedLamports: existing.estimated_lamports,
        lastValidBlockHeight: existing.last_valid_height,
        kind,
        mint: existing.mint,
        resuming: true,
        signature: existing.signature,
      };
    }
    if (
      kind === "launch" &&
      (await c.getAccountInfo(new PublicKey(token.mint), "finalized"))
    )
      throw new ApiError(
        409,
        "This token exists on Solana. Check its launch status before preparing another transaction.",
      );
    await env.CREATORS_DB.prepare(
      "UPDATE creator_intents SET status='expired' WHERE id=? AND status IN ('prepared','submitted')",
    )
      .bind(existing.id)
      .run();
  }
  const payer = new PublicKey(address);
  const online = new OnlinePumpSdk(c);
  let instructions;
  if (kind === "launch") {
    if (await c.getAccountInfo(new PublicKey(token.mint), "finalized"))
      throw new ApiError(
        409,
        "This mint already exists. Check the launch status before retrying.",
      );
    instructions = [
      await PUMP_SDK.createV2Instruction({
        mint: new PublicKey(token.mint),
        name: token.name,
        symbol: token.symbol,
        uri: token.metadata_uri,
        creator: payer,
        user: payer,
        mayhemMode: false,
        cashback: false,
        holderReward: false,
      }),
    ];
  } else {
    await tokenIdentity(env, token);
    if ((await online.getCreatorVaultBalanceBothPrograms(payer)).isZero())
      throw new ApiError(409, "There are no creator fees to collect yet.");
    instructions = await nativeFeeInstructions(c, payer);
    if (!instructions.length)
      throw new ApiError(409, "There are no creator fees to collect yet.");
  }
  const latest = await c.getLatestBlockhash("finalized");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: latest.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
        ...instructions,
      ],
    }).compileToV0Message(),
  );
  const serialized = transaction.serialize();
  if (serialized.length > 1232)
    throw new ApiError(
      400,
      "This transaction is too large. Shorten the token name and try again.",
    );
  const [before, fee, simulation] = await Promise.all([
    c.getBalance(payer, "finalized"),
    c.getFeeForMessage(transaction.message, "finalized"),
    c.simulateTransaction(transaction, {
      sigVerify: false,
      commitment: "finalized",
      accounts: { encoding: "base64", addresses: [address] },
    }),
  ]);
  if (simulation.value.err) {
    const insufficient =
      /insufficient|no record of a prior credit|accountnotfound/i.test(
        JSON.stringify(simulation.value.err) + simulation.value.logs?.join(" "),
      );
    throw new ApiError(
      409,
      insufficient
        ? "Your wallet needs more SOL for the network fee and token accounts. Fund it, then request a new cost estimate."
        : "pump.fun could not simulate this transaction. No transaction was sent. Please try again later.",
    );
  }
  const after = simulation.value.accounts?.[0]?.lamports;
  if (fee.value === null || after === undefined)
    throw new ApiError(
      503,
      "The transaction cost could not be checked. Please try again.",
    );
  const estimated = Math.max(fee.value, before - after);
  const id = random();
  const unsignedTx = Buffer.from(serialized).toString("base64");
  const inserted = await env.CREATORS_DB.prepare(
    "INSERT INTO creator_intents(id,wallet,kind,mint,message_hash,unsigned_tx,blockhash,last_valid_height,estimated_lamports,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM creator_tokens WHERE mint=? AND wallet=? AND status=?) AND NOT EXISTS(SELECT 1 FROM creator_intents WHERE wallet=? AND kind=? AND status IN ('prepared','submitted'))",
  )
    .bind(
      id,
      address,
      kind,
      token.mint,
      await hash(transaction.message.serialize()),
      unsignedTx,
      latest.blockhash,
      latest.lastValidBlockHeight,
      String(estimated),
      now(),
      token.mint,
      address,
      kind === "launch" ? "draft" : "verified",
      address,
      kind,
    )
    .run();
  if (inserted.meta.changes !== 1)
    throw new ApiError(
      409,
      "Another action changed this draft. Refresh your studio to resume it.",
    );
  return {
    id,
    transaction: unsignedTx,
    estimatedLamports: String(estimated),
    networkFeeLamports: String(fee.value),
    lastValidBlockHeight: latest.lastValidBlockHeight,
    kind,
    mint: token.mint,
  };
}
export async function submitIntent(
  env: Env,
  address: string,
  intentId: string,
  signed: unknown,
) {
  if (typeof signed !== "string" || signed.length > 3000)
    throw new ApiError(400, "The signed transaction is invalid.");
  const intent = await env.CREATORS_DB.prepare(
    "SELECT * FROM creator_intents WHERE id=? AND wallet=?",
  )
    .bind(intentId, address)
    .first<Intent>();
  if (!intent) throw new ApiError(404, "Transaction not found.");
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(signed, "base64"),
  );
  const message = transaction.message.serialize();
  if (
    (await hash(message)) !== intent.message_hash ||
    transaction.message.staticAccountKeys[0].toBase58() !== address
  )
    throw new ApiError(
      403,
      "The transaction changed after its cost was reviewed.",
    );
  for (let i = 0; i < transaction.message.header.numRequiredSignatures; i++)
    if (
      !nacl.sign.detached.verify(
        message,
        transaction.signatures[i],
        transaction.message.staticAccountKeys[i].toBytes(),
      )
    )
      throw new ApiError(
        403,
        "A required wallet signature is missing or invalid.",
      );
  const signature = bs58.encode(transaction.signatures[0]);
  if (intent.signature && intent.signature !== signature)
    throw new ApiError(
      409,
      "This transaction has already been submitted with another signature.",
    );
  if (intent.status === "confirmed") return { signature, status: "confirmed" };
  const claimed = await env.CREATORS_DB.prepare(
    "UPDATE creator_intents SET signature=?,signed_tx=?,status='submitted' WHERE id=? AND wallet=? AND (signature IS NULL OR signature=?) AND status IN ('prepared','submitted') AND EXISTS(SELECT 1 FROM creator_tokens WHERE creator_tokens.mint=creator_intents.mint AND creator_tokens.wallet=creator_intents.wallet AND creator_tokens.status IN ('draft','verified'))",
  )
    .bind(signature, signed, intentId, address, signature)
    .run();
  if (claimed.meta.changes !== 1)
    throw new ApiError(409, "The transaction state changed. Check its status.");
  const c = connection(env);
  const existing = await c.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  if (
    existing.value[0]?.err &&
    existing.value[0].confirmationStatus === "finalized"
  )
    throw new ApiError(
      409,
      "This transaction failed on Solana. Review a new transaction.",
    );
  if (existing.value[0])
    return { signature, status: existing.value[0].confirmationStatus };
  if ((await c.getBlockHeight("finalized")) > intent.last_valid_height)
    throw new ApiError(
      409,
      "This transaction expired before confirmation. Request a new estimate.",
    );
  try {
    await c.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });
  } catch {
    throw new ApiError(
      503,
      "The submission result is not known yet. Use Check status; do not approve another transaction.",
    );
  }
  return { signature, status: "submitted" };
}
export async function confirmIntent(env: Env, address: string, id: string) {
  const intent = await env.CREATORS_DB.prepare(
    "SELECT * FROM creator_intents WHERE id=? AND wallet=?",
  )
    .bind(id, address)
    .first<Intent>();
  if (!intent) throw new ApiError(404, "Transaction not found.");
  if (intent.status === "confirmed")
    return { status: "confirmed", signature: intent.signature };
  if (!intent.signature) {
    const height = await connection(env).getBlockHeight("finalized");
    if (height <= intent.last_valid_height) return { status: "prepared" };
    if (
      intent.kind === "launch" &&
      (await connection(env).getAccountInfo(
        new PublicKey(intent.mint!),
        "finalized",
      ))
    )
      throw new ApiError(
        409,
        "This mint exists. Reconcile its original launch transaction before replacing the draft.",
      );
    await env.CREATORS_DB.prepare(
      "UPDATE creator_intents SET status='expired' WHERE id=? AND signature IS NULL AND status='prepared'",
    )
      .bind(id)
      .run();
    return { status: "expired" };
  }
  const c = connection(env),
    status = (
      await c.getSignatureStatuses([intent.signature], {
        searchTransactionHistory: true,
      })
    ).value[0];
  if (status?.err && status.confirmationStatus === "finalized") {
    await env.CREATORS_DB.prepare(
      "UPDATE creator_intents SET status='failed' WHERE id=?",
    )
      .bind(id)
      .run();
    return { status: "failed", signature: intent.signature };
  }
  if (
    !status &&
    (await c.getBlockHeight("finalized")) > intent.last_valid_height
  ) {
    if (
      intent.kind === "launch" &&
      (await c.getAccountInfo(new PublicKey(intent.mint!), "finalized"))
    )
      throw new ApiError(
        503,
        "The token exists but its original transaction is not indexed yet. Please check again.",
      );
    await env.CREATORS_DB.prepare(
      "UPDATE creator_intents SET status='expired' WHERE id=? AND status IN ('prepared','submitted')",
    )
      .bind(id)
      .run();
    return { status: "expired", signature: intent.signature };
  }
  if (status?.confirmationStatus !== "finalized")
    return {
      status: status?.confirmationStatus || "pending",
      signature: intent.signature,
    };
  if (intent.kind === "launch") {
    const token = await env.CREATORS_DB.prepare(
      "SELECT * FROM creator_tokens WHERE mint=? AND wallet=?",
    )
      .bind(intent.mint, address)
      .first<CreatorToken>();
    if (!token || !(await tokenIdentity(env, token)))
      throw new ApiError(
        503,
        "The launch is confirmed but its token record is not available yet.",
      );
    await env.CREATORS_DB.batch([
      env.CREATORS_DB.prepare(
        "UPDATE creator_tokens SET status='verified',verified_at=?,launch_signature=? WHERE mint=? AND wallet=?",
      ).bind(now(), intent.signature, token.mint, address),
      env.CREATORS_DB.prepare(
        "UPDATE creator_intents SET status='confirmed' WHERE id=?",
      ).bind(id),
    ]);
  } else
    await env.CREATORS_DB.prepare(
      "UPDATE creator_intents SET status='confirmed' WHERE id=?",
    )
      .bind(id)
      .run();
  return { status: "confirmed", signature: intent.signature };
}
