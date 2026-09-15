# Public creator platform

**Rollout status:** Code and tests are complete. X secrets and D1 migrations are configured remotely. A dedicated `CREATOR_RPC_URL` is still pending; the creator upgrade is not deployed and token transactions remain disabled until its live checks pass.

## Scope

Public routes `/creators/`, `/creator-studio/`, `/subscriptions/`, and `/c/:handle/` use the neo-brutalist archive theme with channel colors, previews, holder badges, and short animations. Respect system reduced-motion preferences; the global Motion button also saves a device-local preference.

Wallet signatures establish opaque, hashed, 24-hour sessions. X OAuth 2.0 uses PKCE and one-use state bound to the current wallet/session. Draft channels can be saved without X; publication requires both identities. X proves control of an account, not a unique human or an endorsement. Multiple wallets may share an X ID. Public identity links use that stable ID; usernames refresh together when the account is reverified. X access tokens are used once for identity lookup and not retained.

Published videos stay freely retrievable. Holding any positive raw balance of a channel's verified token makes that wallet a subscriber. Both SPL and Token-2022 accounts are queried at finalized commitment and summed with integer precision. No holder counts or income figures are invented. The subscriptions page lists channels held by the signed-in wallet.

Creator tokens are distinct from future NIKKI voting rights. Video submissions remain closed for the founding phase; the founder's first video is still pending.

## Cloudflare deployment

- Pages project: `nikki-run`; account `1b830f55dc609c3dd6f6fe2d30daee47`.
- D1 binding: `CREATORS_DB`; database `nikki-creators` (`e2f2e4ac-3f2b-4a2c-9266-f22119a2bdf8`).
- `wrangler.jsonc` defines the binding, public origin and transaction flag.
- Secrets: `X_CLIENT_ID`, `X_CLIENT_SECRET`; `RPC_URL` for a dedicated mainnet RPC, sourced from local `CREATOR_RPC_URL`. Shared public endpoints blocked the local Workers runtime or required an indexed-access token during validation; use a provider key supporting complete SPL and Token-2022 owner scans. Failed lookups return an error rather than granting membership or pretending a transaction succeeded.
- Exact X callback: `https://nikki.run/api/creators/auth/x/callback`. Use OAuth 2.0 Web App credentials with read scopes. The private Node studio has a separate callback path.

```sh
npx wrangler d1 migrations apply nikki-creators --remote
npm run build:public
npx wrangler pages deploy dist-public --project-name nikki-run --branch main
```

Store secrets using Wrangler's Pages secret commands, through a whitelisted local temporary file with mode 0600, and remove the temporary file after upload. Never upload `.env` wholesale. Wrangler secrets remain server-side; the build reads no X credentials into public files. Redeploy after changing secrets. `.env`, `.dev.vars`, `.creator-secrets*`, `.wrangler`, generated deployment output, local databases and keypairs are ignored by Git.

The advanced-mode Worker handles only `/api/creators/*` and channel asset routing; other Pages assets remain static. APIs require same-origin writes, bounded JSON bodies and D1 rate limits. D1 holds account and transaction records independently from private Prisma/video storage. Preserve applied migrations; add a new migration for future schema changes. D1 recovery/export tools should be used before migrations that modify existing data.

For local runtime checks, migrate with `--local`, build, and run `npx wrangler pages dev dist-public --port 4902 --ip 127.0.0.1`. In ignored `.dev.vars`, set `PUBLIC_ORIGIN="http://127.0.0.1:4902"` and `TOKEN_LAUNCH_ENABLED="false"`. Keep real X secrets out of local fixture testing.

## Token launch and fees

Uses official Pump SDK 2.0.0 and PumpSwap SDK 1.20.0. A creator creates one immutable launch draft. Its temporary mint key exists only in the page session, never localStorage or the server. The server constructs a create-v2 transaction with the verified creator wallet as payer/beneficiary, no initial buy, and Mayhem/cashback/holder-reward modes disabled. Holder-reward mode would redirect creator fees and does not match this product.

Before wallet signing, the server verifies mainnet, simulates the transaction, checks size and presents an estimated SOL cost. Every submitted message must exactly match the saved reviewed message and contain all required signatures. The server stores the signed transaction/signature before broadcast and permits only one active intent per wallet/action. Signing and funding remain explicit user actions.

Confirmed launches are independently checked for Pump program/curve ownership, creator, quote and fee modes, Token-2022 decimals and supply, and exact metadata. Token burns may reduce supply without breaking verification. Metadata and the generated monogram image are hosted on Nikki; they are not represented as Arweave-permanent objects.

Unclaimed creator fees are **wallet-wide across Pump/PumpSwap creator tokens**, not a per-channel revenue figure. Rates are read from current fee state where available; graduated rates may vary. Native Pump fees use the native SOL collection instruction. An AMM collection leg is included only for an existing funded vault, with recipient account creation and SOL unwrapping as required. Wallet review may include network fees and account rent. Earnings are not guaranteed.

## Recovery and pausing

Set `TOKEN_LAUNCH_ENABLED=false` and redeploy to pause new prepared/submitted transactions. Status checks continue. This does not cancel a transaction already signed/broadcast to Solana.

- Retry a pending intent using the same saved transaction. Do not construct another while its blockhash remains valid or its result is known as pending.
- After a network timeout, use **Check status**. The signed transaction is persisted before RPC submission, so status can recover after an interrupted response.
- Finalized failures can be retried with a new blockhash. Unknown transactions must conclusively expire, with no mint on chain, before a launch draft can be discarded.
- If the mint key was lost after reloading, check the original intent. Discard only an unlaunched, expired draft; a launched token cannot be replaced.
- A mint that exists while its original signature is unavailable requires operator reconciliation. Do not delete the database row to bypass this check.

## Validation boundaries

Automated tests use generated keys, SQLite-backed D1 fixtures, mocked X/RPC responses and real SDK instruction builders. They cover signature replay/browser binding, origin checks, profile publication/ownership, X state/session binding, exact integer holdings, transaction substitution/signature rejection, persisted-signature recovery, expiry, competing draft actions, and native fee instruction selection. Local Wrangler HTTP tests check real Workers startup and API behavior.

No funded launch, trading, fee claim, real video preservation or real-user X OAuth round trip is performed by automated deployment. No browser interaction/visual QA was requested or performed. The optional WebMCP creator-search surface is feature-detected; a supported validation context was unavailable, so its browser contract is not claimed as verified.
