# Public creator platform

**Rollout status:** The public creator platform is hosted at `nikki.run` on Cloudflare Pages. X and dedicated mainnet RPC secrets are configured, D1 migrations 0001–0003 are applied, R2 image storage is connected, and creator token transactions are enabled. The first founder drop is permanently live. General public permanent-video submissions and NIKKI voting remain closed; free text/image posts have a separate publishing flow. The current code adds migration 0004 for those posts and community artwork; its deployment verification is tracked with this release. See the current and historical validation boundaries below.

## Scope

Public routes `/creators/`, `/creator-studio/`, `/subscriptions/`, and `/c/:handle/` use the neo-brutalist archive theme with channel colors, previews, holder badges, and short animations. Respect system reduced-motion preferences; the global Motion button also saves a device-local preference.

Wallet signatures establish opaque, hashed, 24-hour sessions. X OAuth 2.0 uses PKCE and one-use state bound to the current wallet/session. Draft channels can be saved without X; publication requires both identities. X proves control of an account, not a unique human or an endorsement. Multiple wallets may share an X ID. Public identity links use that stable ID; usernames refresh together when the account is reverified. X access tokens are used once for identity lookup and not retained.

Published videos stay freely retrievable. Holding any positive raw balance of a channel's verified token makes that wallet a subscriber. Both SPL and Token-2022 accounts are queried at finalized commitment and summed with integer precision. No holder counts or income figures are invented. The subscriptions page lists channels held by the signed-in wallet.

Creator tokens are distinct from future NIKKI voting rights. General video submissions remain closed for the founding phase. The founder's first drop, **“Nikki is live?”**, is published to the permanent archive: video `OD5bThQU9SCsX-_5fJ2Q9HTfjpqBTExMaHVOTUjmKoc`, metadata `S-GcrFCCefS4uWoRVRe4f6do_3xxQtTFAam-oScgSdY`. Later drafts are not permanent records until their own preservation flow completes.

## Free channel posts and community imports

Every published wallet-and-X channel can share free text and image posts without launching a token, holding a token or paying a Nikki posting fee. The **Post** button opens a composer with text, one optional device image and an optional image description. Text-only and image-only posts are supported. Channel pages display their creator's posts; only that channel's owner can publish there. Community feeds also support text/images, with the existing joined-wallet and paired-X requirements. Anyone can read public posts.

Text is stored in D1 and uploaded images in the existing `CREATOR_MEDIA` R2 bucket. These posts can be removed and are not Arweave/permanent archive records. Channel authors can delete their posts and the founder can hide them; community authors, organizers and founder retain their existing removal/moderation roles. Retrying the same post request does not create duplicate posts. Hiding a post or unpublishing a channel removes that reference's public image access; previously downloaded copies cannot be recalled. Permanent video approval and storage payment remain separate.

Existing Solana token communities can import from a mint, pump.fun coin link or Dexscreener Solana pair link after pairing X. Available token name, logo, banner and public links are filled in for review, with onchain identity taking priority. The token input survives the sign-in/pairing return flow. Device upload controls let organizers replace the logo/banner without hosting an image URL. Missing source artwork stays blank until provided; external X links never prove ownership of the linked X account. See [COMMUNITIES.md](COMMUNITIES.md) for provider checks and import eligibility.

### Posting and image allowances

- Each post supports 2,000 text characters, one image and a 240-character image description. Per wallet and paired X identity, each feed family permits five posts/minute and 50/day.
- Channel post records are capped at 25,000 total and 1,000 per author. The corresponding community caps are 25,000 total, 5,000 per community and 1,000 per author. Hidden/deleted records still count toward these early-release allowances.
- The new community/post picker accepts JPG, PNG or WebP up to 20 MiB/60 million decoded pixels, and re-encodes JPEGs before upload. Browser output targets: community logo 512 px/128 KiB, banner 1,600 px/384 KiB, post image 1,600 px/512 KiB. The Worker independently validates JPEGs and bounds bytes/dimensions.
- New community artwork/post images share 20 MiB per wallet and 256 MiB total. Upload limits are 20/hour per wallet and X identity, and 40/hour per IP. These allowances are separate from the earlier channel avatar/cover quotas below. A capacity error does not initiate a payment.
- Image ownership and attachment kind are verified in the API and SQL triggers. Unattached uploads are private to their owner. Unreferenced assets become eligible for cleanup after 24 hours, with bounded cleanup during later uploads; moderated records retain their referenced assets. New content-image responses use `no-store`.

### Current release validation

All 95 automated tests, TypeScript and the public build pass. Coverage includes provider-link parsing/failures, preserved authority checks, channel/community post permissions and idempotency, image ownership, visibility after removal and capacity enforcement. Local X identities are fixtures; these checks do not establish a new real-user OAuth round trip. Deployment and browser QA are recorded separately when completed. Earlier validation notes below describe their respective historical releases.

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

## Historical validation boundaries — initial creator release

Automated tests use generated keys, SQLite-backed D1 fixtures, mocked X/RPC responses and real SDK instruction builders. They cover signature replay/browser binding, origin checks, profile publication/ownership, X state/session binding, exact integer holdings, transaction substitution/signature rejection, persisted-signature recovery, expiry, competing draft actions, and native fee instruction selection. Local Wrangler and production HTTP checks verified real Workers startup, wallet login/logout, private draft persistence locally, live holder lookups, X authorization redirect settings, static routes and 404s. The temporary production test wallet had no public profile or transaction and was removed after validation.

At the initial creator release, automated deployment performed no funded launch, trading, fee claim, real video preservation or real-user X OAuth round trip. An unsigned mainnet launch simulation exercised the insufficient-SOL refusal; no transaction was broadcast. That initial validation did not include browser interaction/visual QA. The optional WebMCP creator-search surface was feature-detected; a supported validation context was unavailable, so its browser contract was not claimed as verified. The first founder video was preserved later, as recorded in Scope above.

## Release experience upgrade

- Dedicated mobile bottom navigation and studio sections; safe-area spacing, touch targets, bottom-sheet dialogs, reduced motion and native share/copy fallbacks. Missing mobile wallet injection offers the official Phantom/Solflare browser handoff. X verification remains bound to the originating session; a failed callback explains how to return to the correct browser.
- `/library/` stores saved records and playback positions in D1 per authenticated wallet. Only IDs from the verified static archive are accepted. Progress writes are throttled and serialized; removing a library item clears its saved state and position. The 500-item limit is enforced atomically.
- `/help/` supports wallet-private requests and founder replies. Requests are bounded and limited to five per wallet/day. Target channel wallet/mint is captured at submission. Reports never delete archived video.
- `/ops/` requires the exact server `FOUNDER_WALLET`, never a client role or X username. It shows private support, recent transactions, an audit trail, service checks, image capacity, and a persistent transaction pause switch. It checks existing transactions without creating or signing new ones. A missing original receipt still needs a separately verified operator recovery procedure; the status button does not attach or infer a signature.
- Studio Activity pages through owner-only transaction receipts. Signing payloads and session/OAuth data are excluded.
- R2 binding `CREATOR_MEDIA` uses `nikki-creator-media`. Uploaded channel artwork is separate from token metadata/monograms. Uploads require a saved channel and paired X identity. The browser crops/resizes to JPEG; the Worker bounds streams and checks JPEG dimensions. Caps: avatar 128 KB/512 px, cover 384 KB/1600 px, 2 MB per wallet including pending images, 64 MB total. Per-wallet, X-identity and IP limits protect upload capacity. Replaced artwork is reclaimed; incomplete uploads expire after an hour. Private drafts require ownership; public artwork has a 60-second browser/edge cache, so already downloaded public images are not retroactively private.
- Public directory responses use canonical query keys and a 15-second edge cache. Successful holder results use an internal 20-second cache while browser responses remain `no-store`. Single-channel checks query only that mint. The general public-read limiter is an inexpensive, per-Worker-instance barrier, not a globally exact quota or substitute for Cloudflare attack protection. Mutations and expensive RPC actions keep atomic D1 limits.
- Search uses literal `instr` matches to avoid D1's small LIKE-pattern limit. Discovery has working pagination and retry states.

### Backups

Run `node scripts/backup-creators.mjs` before schema changes. It exports the remote D1 database into ignored `.backups/creators/` with mode 0600, restores the SQL into an isolated in-memory database, and checks integrity and foreign keys. Export files contain private account/support/session data: keep them private. This validates a D1 export; it does not back up R2 objects or replace Arweave verification. Keep a separate secure copy of required backup files for machine-loss recovery.

### Historical validation — release experience upgrade

That upgrade passed 27 unit/security tests and the existing 28 integration checks, TypeScript and both application builds. Its remote pre-migration database export passed an isolated restore check. At that stage, first-video captions, chapters, real playback delivery, funded creator transactions and actual mobile-wallet/X return journeys had not been validated by those checks. The first founder drop was subsequently preserved; its completion does not establish funded-token or real-device OAuth validation for the current release.
