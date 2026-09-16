# Nikki

A neo-brutalist video archive for preserving human history and knowledge.

**Status: creator release live at https://nikki.run on Cloudflare Pages.** Wallet-and-X channels, pump.fun creator tokens, token-holder subscriptions, and creator fee collection are implemented. The first founding record, **“Nikki is live?”**, is preserved on Arweave and appears in the homepage Creator drop and public archive. Its video and signed metadata passed block-inclusion and full retrieval/hash verification. Public video uploads, storage payments, and NIKKI voting are closed until the later community release. The private Node studio and preservation worker stay on the operator’s machine. The user funded the first record’s storage by card and signed its founder publication approval.

## Public release

Run `npm run build:public` to export the verified founder archive to `dist-public/`. Deploy **only that directory** with `npx wrangler pages deploy dist-public --project-name nikki-run --branch main`. The public APIs use an advanced-mode Worker and a separate D1 database; apply their migrations and configure secrets first, as described in [creator operations](docs/CREATORS.md). The export validates founder signatures, omits all private records and server files, and creates watch pages only for records already marked published after storage verification. See [release operations](docs/PUBLIC_RELEASE.md).

## Run locally

Use Node 22.9 or newer (Node 22 LTS is the deployment target).

1. Install packages with `npm ci`.
2. Copy `.env.example` to `.env` only if you do not already have an environment file. Generate a random session secret of at least 32 characters.
3. Run `npx prisma generate`, then `npm run db:migrate`. For a brand-new SQLite database, create an empty `prisma/dev.db` file first if the migration engine requires it.
4. Run `npm run dev` and open [Nikki locally](http://127.0.0.1:4900).
5. In another terminal, run `npm run worker` for election closing, temporary-file cleanup, and configured preservation jobs.

Keep `RELEASE_MODE=founder`, the supplied `FOUNDER_WALLET`, `VOTING_ENABLED=false`, and `PUBLISHING_ENABLED=false` until storage setup is complete. Wallet sign-in and private submission work independently of the planned token.

## Implemented

- Archive browsing, text search, collection filters, playback, and permanent-record links.
- Creator studio: MP4/WebM, 1,000,000,000-byte source limit, chunk retries, frozen metadata and SHA-256 fingerprint.
- Expiring, single-use wallet challenges; X OAuth with PKCE and stable account binding.
- Finalized Solana eligibility snapshots: strictly more than 10 million NIKKI, private treasury exclusion, one vote per wallet.
- Signed ballots, a fixed 24-hour window, at least five voters, at least 80% approval.
- SOL quotes after approval, explicit publication confirmation, exact-payment validation, and immutable quote history.
- Durable preservation queue. Turbo/Arweave adapter archives the video and a separate JSON record containing its context and signed ballots.
- Full retrieval, size, fingerprint, and block-inclusion checks before public listing.
- Temporary-storage limits, crash-lock recovery, and paid-file retention.

Published records have no delete or delist operation. Solana handles voting eligibility and payments; **video bytes are intended for Arweave, not Solana account storage**. Network availability is not an absolute guarantee of “forever.”

## Validate

```sh
npm test
npm run build
npm run test:integration
```

The integration script uses generated wallets, an isolated temporary database, a local RPC fixture, and no real payments or storage uploads. It checks authentication replay, upload limits, access control, election outcomes, historical payment recovery, and worker retention.

The 15-second founding film (2,644,637 bytes) passed real permanent-storage verification; its Creator drop was checked in desktop and mobile browser layouts. See [the first record’s release evidence](docs/CREATOR_DROP.md). The 1 GB boundary and streaming/chunk design are checked; a representative real 1 GB video has **not** been uploaded to permanent storage or playback-tested. X credentials are configured in Cloudflare; a real user OAuth round trip and funded token launch/fee claim have not been exercised by the deployment agent.

## Before the community launch

See [operations and deployment](docs/OPERATIONS.md) for hosting, configuration, recovery, dependency findings, and the remaining live acceptance checks. See [product decisions](docs/PRODUCT_BRIEF.md) for the agreed rules.

The original HTML informed the visual direction only. Archival photographs on the About page are credited inspiration, not fake published videos.

## Token communities

Existing Solana tokens can import a community profile, logo, and links into Nikki. Community text posts are free and stored offchain, separately from permanent video records. See [Communities](docs/COMMUNITIES.md) for access rules, supported imports, and deployment.
