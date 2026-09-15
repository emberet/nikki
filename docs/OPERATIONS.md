# Nikki operations

## Public founding release

The public website uses Cloudflare Pages project `nikki-run`, serving the generated `dist-public/` archive. It has no server API, accounts, wallet connection, creator uploads, payment collection, or voting. See [public release instructions](PUBLIC_RELEASE.md). The first video will be supplied later.

## Private studio deployment model

The private publishing studio uses **one Node host**, Prisma SQLite, a persistent temporary-video directory, and one preservation worker. Use Node 22 LTS, a persistent disk with room beyond the 5 GB upload allocation, HTTPS, and backups. Do not run multiple web replicas against copied local databases or multiple workers.

The available Sites host runs Cloudflare Workers and cannot directly run this application's filesystem, native Prisma SQLite client, and continuous worker. Deploying there would require a separate D1/R2/job architecture migration. A conventional persistent Node host is the direct deployment path. No separate Node host has been purchased or configured; the studio currently runs locally.

Cloudflare can remain the DNS provider for nikki.run. A reverse proxy must forward the real HTTPS origin and permit requests above the 8 MiB upload chunk size (allow at least 10 MiB). Set request-body and rate limits. Large preservation transfers and full verification run in the worker, outside HTTP requests.

### Deployment sequence

1. Put the source on the host and run `npm ci` and `npx prisma generate`.
2. Set absolute `DATABASE_URL=file:/persistent/path/nikki.db`, `HELD_DIR`, and storage key paths. Create their parent directories and an empty database file for first startup. The service user must own them; key files should be readable only by that user.
3. Back up the existing database and held files consistently before migrations. Run `npm run db:migrate`. Never use `prisma migrate reset` on real data.
4. Set `APP_URL` to the private studio’s exact HTTPS origin (the public static domain is a separate deployment), a strong session secret, and an appropriate public browser RPC before `npm run build`.
5. Run `npm run start:production` under a process supervisor that restarts it and captures logs. It starts the web server and preservation worker together. Set `PORT` for the web server; put HTTPS in front.
6. Check health and a small test submission before opening access.

`npm run start:production` uses `next start` from the complete checkout. The optional Next standalone build must include `public` and `.next/static` if deployed separately.

Web and worker must share the same environment, database, directory, and PID namespace. An upload lock only clears automatically when its recorded process no longer exists. Inspect unknown legacy locks or PID reuse manually after stopping the affected process.

## Live configuration

Set `RELEASE_MODE=founder` and `FOUNDER_WALLET` for the private first-record flow. `UPLOADS_ENABLED=true` admits only that wallet in founder mode. The default production mode is closed. The founding record uses the project’s prepaid Turbo credits and does not charge a creator SOL transfer. The worker heartbeat must be fresh before the founder can queue preservation. `PUBLISHING_ENABLED=false` keeps permanent uploads disabled until configured.

| Value                         | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| APP_URL                       | Exact public origin for sessions, request checks, and X callback      |
| SESSION_SECRET                | Random secret, at least 32 characters; keep out of source control     |
| RPC_URL                       | Server RPC supporting complete finalized SPL token-account scans      |
| NEXT_PUBLIC_RPC_URL           | Browser RPC for wallet payments; inherently public                    |
| TOKEN_MINT                    | Actual NIKKI mint, standard SPL, planned initial supply 1 billion     |
| TREASURY_WALLET_HASH          | SHA-256 of the treasury's base58 public address, private server value |
| X_CLIENT_ID / X_CLIENT_SECRET | X OAuth application with callback APP_URL/api/auth/x/callback         |
| PAYMENT_WALLET                | Separate operational SOL payment recipient, visible in transfers      |
| STORAGE_KEYPAIR_PATH          | Separate Solana storage signer, with prepaid Turbo credits            |
| VOTING_ENABLED                | Explicit switch for new elections                                     |
| PUBLISHING_ENABLED            | Explicit switch for new quotes and preservation                       |

Configure X user access before enabling voting. A wallet's X account is linked once. Multiple eligible wallets may authenticate to the same X account: the agreed rule is one vote per eligible wallet, not one person per vote.

Eligibility freezes X bindings and token balances when a proposal opens. Supply scans reconcile all raw token balances against current supply, allowing burns below the initial billion-token cap. Token-2022 and incomplete RPC scans are rejected. The backend enforces snapshots; this is not an audited on-chain governance program.

The treasury is excluded by a private hash comparison. This hides its address from ordinary interface responses, not from inference or a party who can read the server configuration. A separate developer wallet gets no eligibility exemption.

## Pricing and storage

The Turbo adapter is the implemented candidate storage integration. It has not yet passed live upload acceptance tests. Prices are fetched for both the video and JSON archive record, with 16 KiB per-item overhead allowance. Decimal SOL prices are converted exactly to lamports. Quotes expire after 15 minutes; the wallet pays Solana's transaction fee separately.

Storage credits must already be funded. Nikki never automatically tops up or transfers treasury funds. Creator payments arrive in the operational payment wallet; they do not automatically replenish Turbo. An operator must manage that balance and any SOL conversion risk. Quotes are estimates; prepaid balance checks do not reserve provider credits, so concurrent jobs can wait for funding.

Every refreshed quote remains in history. A transfer made within an older quote's valid time window is still recoverable after a new quote is issued. Validation checks the finalized transaction, signer, exact payer-to-recipient transfer, amount, reference memo, and quote timing. Recovery still works if new purchases are paused.

No creator charge occurs before community approval. A verified payment changes the submission to `payment_received`; the creator then starts preservation. The API records `publish_queued` and returns promptly. The worker uploads and verifies the two permanent items before setting `published`.

## Failure recovery

Known first-video acceptance item: if the video receipt exists but metadata upload is uncertain or missing, the singleton founding record remains reserved. Do not reset it or start another video upload. Reconcile provider receipts; creating a confirmed-missing metadata item is still an operator task. The reconciliation command never uploads or sends funds.

- **Interrupted private upload:** retry the same submission in the open studio. The server returns the current byte offset. Reloading the page currently loses the selected local file and in-memory upload session; abandoned uploads expire.
- **Wallet sent payment, browser disconnected:** the signature is saved in browser storage when available. Paste the existing signature into “Recover your payment.” Do not pay again.
- **Payment verified, no storage:** retain both payment and held file. Queued jobs retry funding checks; the operator funds the prepaid service.
- **Uncertain upload result:** `publish_failed` intentionally blocks automatic re-upload. Inspect saved receipts and search the provider's records using the proposal tag. Reconcile the original IDs first.
- **Both receipts known:** run `npm run storage:reconcile -- VIDEO_ID VIDEO_TRANSACTION_ID RECORD_TRANSACTION_ID`. The command verifies block inclusion and retrieves/hashes both candidate objects before changing the database. Incorrect or unconfirmed IDs leave the saved record unchanged. It marks the record published only after full verification; the worker later clears the temporary cache.
- **Only one item succeeded:** recover the other existing item or explicitly complete the missing item after confirming it was not already accepted. Never silently repeat a possibly completed upload.
- **Unrecoverable preservation:** resolve a manual refund from the operational wallet with the creator. Automated refunds and an operator recovery UI are not implemented. Never tell a paid creator to pay again.
- **Published copy:** temporary-cache deletion happens only after verification. There is no endpoint for deleting the permanent item or delisting a published record.

Before restarting after a crash, ensure the old worker has exited. The replacement worker marks interrupted jobs with missing receipts for reconciliation and resumes confirmation when both receipts are present.

## Pilot limits and retention

- Source video cap: 1,000,000,000 bytes, MP4 or WebM.
- Private chunk cap: 8 MiB; basic container-signature checks, no server transcoding.
- Two active submissions per creator and 5 GB total reserved/retained private-video capacity.
- Incomplete uploads: 24 hours from submission creation.
- Submissions waiting to open voting: seven days from creation. Decided submissions without a storage quote: seven days from the vote result.
- Quoted or paid records: retained for payment reconciliation; the operator must reconcile them to recover capacity.
- Cleanup runs on upload initialization and in the worker, up to ten expired records per pass.
- Public feeds currently show the most recent 100 records; pagination and full-text search indexing are future work.

A moderator must actually watch the private preview. Container checks alone do not prove a file is decodable or that its contents are appropriate. Only source-video formats supported by the viewer's browser play directly. Transcoding, adaptive streaming, captions, and thumbnail generation are not included.

## Remaining community launch checks

1. Launch/configure the intended token and determine allocation and mint authorities.
2. Complete a real X OAuth login and verify account-link consent.
3. Validate the selected RPC's full snapshot support and rate limits for the actual mint.
4. Test a small real SOL payment, quote expiry, recovery, and refund handling.
5. Test both Turbo uploads, block confirmation, and independent retrieval.
6. Test a representative real video up to 1 GB, playback, seeking, and interrupted networks on desktop and mobile.
7. Run browser interaction and accessibility checks.
8. Validate backup restoration, worker restarts, disk alerts, request throttling, and host costs against the $200 bootstrap budget.
9. Resolve or explicitly assess the remaining dependency findings before accepting public funds.

## Community payment acceptance item

The backend rejects repeated payment signatures, but two browser tabs can still send two distinct SOL transfers for the same proposal. Do not enable public payments until client/server payment-attempt coordination and a two-tab acceptance test are complete. This path is closed in founder mode and absent from the public static release.

## Dependency status

Next was upgraded from 14.2.35 to 15.5.25 with React 19. Unused Irys packages were removed. Same-major overrides patch elliptic, secp256k1, ws, and PostCSS copies.

The dependency audit still reports high/moderate/low findings, including transitive Solana/Turbo dependencies. A clean audit or production security review is not claimed. Do not use `npm audit fix --force`: its Turbo recommendation can downgrade the SDK. Refresh `npm audit --omit=dev` during release review; the stored counts are not a permanent security guarantee.

## Reference documentation

- [Next 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next August 2026 security release](https://nextjs.org/blog/august-2026-security-release)
- [Turbo SDK](https://docs.ar.io/sdks/turbo-sdk)
- [Arweave storage model](https://docs.arweave.org/developers/development/motivation)
