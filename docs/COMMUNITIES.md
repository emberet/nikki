# Communities

Nikki communities let existing Solana tokens bring their profile, logo and social links into Nikki. They are separate from permanent video records and NIKKI archive governance.

## Product behavior

- `/communities/` is a searchable public directory; `/communities/:mint/` is a community profile and text feed.
- Importing requires wallet sign-in and a paired X account. The server reads the deployed mint at finalized commitment. SPL Token and Token-2022 mints are supported, including tokens launched outside Nikki.
- The importer must control a supported onchain token authority or hold a positive token balance. The first verified import establishes the organizer; one community exists per mint. A holder-led community is labeled **Community-led**. An authority check never grants control over token funds or fees.
- Metadata lookup fills available token details, logo and links. Review the imported values before publishing. Missing or unsupported metadata can be completed manually; manually supplied community branding is not an onchain token metadata update.
- Anyone can browse. Signed-in wallets can join or leave for free. Posting requires a paired X identity. Membership is a social follow, not a purchase, an ownership right, or NIKKI governance eligibility.
- Importing, joining and text posting have no Nikki fee and do not construct blockchain transactions. Text lives in Cloudflare D1. It is not part of the permanent archive. Permanent video storage retains its separate approval and payment process.
- Authors can remove their posts. Organizers and the founder can moderate the community feed. Reports go through Help & reports, with the community and post reference included.

## Boundaries

Import does not launch another token, move tokens, migrate external posts or members, transfer trading fees, or change existing creator-token transaction records. It imports the token details and community profile requested for this release. Tokens on chains other than Solana are not supported.

An authority badge records the authority checked at import. Authorities can change onchain; the badge is not an endorsement, proof of a unique human, or guarantee of current ownership. A community organizer controls the Nikki profile, not the underlying token. Existing support handles disputes.

## Storage and access

Migration `creator-worker/migrations/0003_communities.sql` adds the community, membership and post tables without changing existing archive or creator-token records. Bounded text, per-wallet and identity rate limits, database quotas, and idempotent post creation keep free posting manageable on the bootstrap deployment. Pagination uses actual stored records; no sample communities or invented activity are published.

The Worker enforces same-origin writes, authenticated wallet sessions, X requirements, organizer permissions, and imported URL validation. Token and authority checks use the configured mainnet RPC, never a client-supplied endpoint. Server-side external metadata reads are constrained to supported gateways and bounded in time and size. Imported logo URLs load as images only; community pages permit HTTPS images while retaining the script, frame and object restrictions. External image hosts receive browser request information, as described on the privacy page.

## Release procedure

1. `node scripts/backup-creators.mjs` exports the private remote D1 database and verifies a restore before changing the schema.
2. Run `npm test`, `npm run typecheck` and `npm run build:public`.
3. Apply migration 0003 locally, then exercise the directory, import flow, account gates, community feed and mobile layout.
4. Apply the additive migration remotely and deploy `dist-public` to the existing Cloudflare Pages project.
5. Check production directory APIs, authentication gates, unknown-community 404s, public assets and the unchanged signed archive. Test content belongs only in local fixtures.

Existing creator account, wallet signing and X verification setup is documented in [CREATORS.md](CREATORS.md). No new secret or paid service is needed for Communities.

## Release verification — 17 September 2026

- Migration 0003 is applied to the existing remote D1 database. Cloudflare's SQL splitter required the quota-trigger CASE expressions to be parenthesized, matching migration 0002; the rejected first attempt left no new tables or migration record. The corrected migration succeeded.
- Deployed to the existing Pages project: https://32f52881.nikki-run.pages.dev. Production alias: https://nikki-run.pages.dev/communities/; primary site route: https://nikki.run/communities/.
- All 66 automated tests pass, including import authority/holder proofs, unsafe metadata, free-post permissions, duplicate requests, concurrent moderation, and route escaping. TypeScript and the public export pass.
- The isolated local Cloudflare runtime verified signed wallet login, join, free posting, same-request retry, deletion, replay refusal and logout. X identity was a local fixture; no real-user X login or external post was performed for these tests.
- Browser checks covered desktop, 390 px and 320 px layouts, search/no-results, the import sign-in gate, a locally seeded community/feed, mobile navigation and horizontal overflow. Local fixtures were not deployed.
- A read-only mainnet lookup of the existing Nikki token returned its real name, symbol, description, logo, website and X link, with the founder wallet recognized from Pump's creator record. The same-CID IPFS gateway fallback recovered metadata when the primary gateway was rate-limited.
- Production checks verified the directory and API, import login requirements, cross-origin rejection, unknown-community 404s, shared navigation and styles. The public directory starts empty until an eligible signed-in organizer imports a community.
- The signed archive JSON remains byte-for-byte unchanged (SHA-256 `66cac8f11a127547c2c9a133281507712b40b82589c899d8bb4bd9e6d32a728f`). No token transactions, fee transfers or permanent uploads were performed.
