# Communities

Nikki communities let existing Solana tokens bring their profile, logo, banner and social links into Nikki, with free text and image posts. They are separate from permanent video records and NIKKI archive governance.

## Product behavior

- `/communities/` is a searchable public directory; `/communities/:mint/` is a community profile with a banner and a text/image feed.
- Importing requires wallet sign-in and a paired X account. The server reads the deployed mint at finalized commitment. SPL Token and Token-2022 mints are supported, including tokens launched outside Nikki.
- The importer must control a supported onchain token authority or hold a positive token balance. The first verified import establishes the organizer; one community exists per mint. A holder-led community is labeled **Community-led**. An authority check never grants control over token funds or fees.
- Paste a token mint, a `https://pump.fun/coin/:mint` link (legacy `https://pump.fun/:mint` links also work), or a `https://dexscreener.com/solana/:pair` link. Dexscreener links resolve the exact Solana pair's base token before onchain checks. Wrong-chain, ambiguous and unsupported links are rejected. The entered link is retained locally across the wallet/X connection flow so the user can continue the import afterward.
- Metadata lookup fills available name, symbol, description, logo, banner, website, X and Telegram links. Onchain identity and its referenced metadata take precedence; matching Dexscreener listing data fills missing display fields. Pump links use the token's onchain metadata reference, not an undocumented Pump API. Some tokens do not publish a banner or complete links; missing values remain editable rather than being invented.
- Review the imported values before publishing. Logo and banner controls accept device uploads instead of requiring an image URL; imported artwork can be kept, replaced or removed. Manually supplied branding changes the Nikki community profile, not the token's onchain metadata. An imported X link is a public profile link, not proof that the connected person controls that account.
- Anyone can browse. Signed-in wallets can join or leave for free. Posting requires a paired X identity. Membership is a social follow, not a purchase, an ownership right, or NIKKI governance eligibility.
- A prominent **Post** button opens the composer. Posts can contain text, one image, or both, with an optional image description for accessibility. Importing, joining, and text/image posting have no Nikki fee and do not construct blockchain transactions. Text lives in Cloudflare D1 and uploaded images in R2. These are removable posts, not permanent archive records. Permanent video storage retains its separate approval and payment process.
- Authors can remove their posts. Organizers and the founder can moderate the community feed. Reports go through Help & reports, with the community and post reference included.

## Boundaries

Import does not launch another token, move tokens, migrate external posts or members, transfer trading fees, or change existing creator-token transaction records. It imports the token details and community profile requested for this release. Tokens on chains other than Solana are not supported.

An authority badge records the authority checked at import. Authorities can change onchain; the badge is not an endorsement, proof of a unique human, or guarantee of current ownership. A community organizer controls the Nikki profile, not the underlying token. Existing support handles disputes.

## Storage and access

Migration `creator-worker/migrations/0003_communities.sql` adds the community, membership and post tables. Additive migration `0004_social_media.sql` adds community artwork references, image attachments, shared content assets and channel posts. Neither changes existing archive or creator-token transaction records. Bounded text, per-wallet and identity rate limits, database quotas, and idempotent post creation keep free posting manageable on the bootstrap deployment. Pagination uses actual stored records; no sample communities or invented activity are published.

### Free-post and image limits

- Posts allow up to 2,000 text characters, one image and a 240-character image description. Community posting is limited to five posts/minute and 50/day per wallet and paired X identity. Channel posts have their own equivalent limits.
- Community post records are capped at 25,000 total, 5,000 per community and 1,000 per author. Channel post records are capped separately at 25,000 total and 1,000 per author. Deleted/hidden records still count toward these early-release record allowances.
- The device picker accepts JPG, PNG or WebP up to 20 MiB and 60 million decoded pixels. The browser re-encodes JPEGs, removing original metadata. Its output targets are logo: 512 px/128 KiB, banner: 1,600 px/384 KiB, post image: 1,600 px/512 KiB. The server independently checks JPEG structure, bounds the stream to 512 KiB and dimensions to 1,600 px, with an additional 512 px logo bound.
- Community artwork and post images share a 20 MiB allowance per wallet and 256 MiB total, separate from existing channel avatar/cover allowances. Upload rate limits are 20/hour per wallet and X identity, and 40/hour per IP. No new payment is requested when a limit is reached; the API returns a capacity or retry error.
- An uploaded image can only be attached by its owner and for its intended kind. Database triggers also enforce ownership/readiness during concurrent updates. Unattached images are private to the uploading wallet; referenced images are public only while an associated profile/post is public. Content images use `no-store` responses. Removing or hiding a post withdraws that reference's public access; another visible reference can still make a shared image public, and downloaded copies cannot be recalled.
- Authors can remove their own posts; community organizers and the founder can hide posts. Hidden records retain their data for moderation. Unreferenced uploads become eligible for cleanup after 24 hours; cleanup runs in bounded batches during subsequent uploads. Referenced moderation records protect their images from cleanup.

The Worker enforces same-origin writes, authenticated wallet sessions, X requirements, organizer permissions, and imported URL validation. Token and authority checks use the configured mainnet RPC, never a client-supplied endpoint. Server-side external metadata reads use supported content-addressed gateways; listing reads use fixed [Dexscreener API endpoints](https://docs.dexscreener.com/api/reference). Fetches reject redirects and are bounded in time and size. Listing and social data never establish token authority. Imported artwork URLs load as images only; community pages permit HTTPS images while retaining script, frame and object restrictions. External image hosts receive browser request information, as described on the privacy page. Device uploads use the existing `CREATOR_MEDIA` R2 binding.

## Release procedure

1. `node scripts/backup-creators.mjs` exports the private remote D1 database and verifies a restore before changing the schema.
2. Run `npm test`, `npm run typecheck` and `npm run build:public`.
3. Apply all unapplied migrations locally, including 0004 for artwork and image/channel posts; then exercise the directory, provider-link import flow, account gates, image uploads, both feeds and mobile layout.
4. Apply the additive migration remotely and deploy `dist-public` to the existing Cloudflare Pages project.
5. Check production directory and channel APIs, authentication gates, unknown-community 404s, public assets and the unchanged signed archive. Test content belongs only in local fixtures.

Existing creator account, wallet signing and X verification setup is documented in [CREATORS.md](CREATORS.md). No new secret or paid service is needed for Communities.

## Current release validation — provider imports and free image posts

- All 95 automated tests pass, including token-link normalization, provider failure/mismatched data, onchain authority preservation, channel/community post permissions, image ownership/readiness, removal visibility and storage quotas. TypeScript and the public build pass.
- X identities used by these automated/local tests are fixtures. This release does not claim a new real-user X OAuth round trip from those checks.
- Production deployment and browser QA are recorded in the device-artwork release verification below. The historical release describes the earlier text-only Communities deployment.

## Historical release verification — initial Communities, 17 September 2026

- Migration 0003 is applied to the existing remote D1 database. Cloudflare's SQL splitter required the quota-trigger CASE expressions to be parenthesized, matching migration 0002; the rejected first attempt left no new tables or migration record. The corrected migration succeeded.
- Deployed to the existing Pages project: https://32f52881.nikki-run.pages.dev. Production alias: https://nikki-run.pages.dev/communities/; primary site route: https://nikki.run/communities/.
- All 66 automated tests pass, including import authority/holder proofs, unsafe metadata, free-post permissions, duplicate requests, concurrent moderation, and route escaping. TypeScript and the public export pass.
- The isolated local Cloudflare runtime verified signed wallet login, join, free posting, same-request retry, deletion, replay refusal and logout. X identity was a local fixture; no real-user X login or external post was performed for these tests.
- Browser checks covered desktop, 390 px and 320 px layouts, search/no-results, the import sign-in gate, a locally seeded community/feed, mobile navigation and horizontal overflow. Local fixtures were not deployed.
- A read-only mainnet lookup of the existing Nikki token returned its real name, symbol, description, logo, website and X link, with the founder wallet recognized from Pump's creator record. The same-CID IPFS gateway fallback recovered metadata when the primary gateway was rate-limited.
- Production checks verified the directory and API, import login requirements, cross-origin rejection, unknown-community 404s, shared navigation and styles. The public directory starts empty until an eligible signed-in organizer imports a community.
- The signed archive JSON remains byte-for-byte unchanged (SHA-256 `66cac8f11a127547c2c9a133281507712b40b82589c899d8bb4bd9e6d32a728f`). No token transactions, fee transfers or permanent uploads were performed.

## Device artwork and free-image release verification — 17 September 2026

- The isolated local Cloudflare runtime accepted device logo/banner uploads, saved both to a community, and served the attached images publicly after save.
- Browser checks verified channel text-only and text-plus-image posts, an image-only community post, accessible image descriptions, the provider-link entry form, and post-report references surviving initial sign-in. No test content was posted to production.
- Desktop, 390 px and 320 px layouts were checked. The mobile composer and feeds have no horizontal overflow at those widths.
- Anonymous feeds and attached images are readable; unauthenticated posting is rejected. Backend tests cover deletion, moderation, ownership, retries, caps, and cleanup races. Real-user X authentication and current external provider responses were not re-tested in this release.
- A private remote D1 export passed an isolated restore before additive migration 0004 was applied. The public archive remains byte-for-byte unchanged (SHA-256 `66cac8f11a127547c2c9a133281507712b40b82589c899d8bb4bd9e6d32a728f`).

- Source commit `fad6999` is deployed at https://082e3a52.nikki-run.pages.dev. Cloudflare lists both `nikki.run` and `nikki-run.pages.dev` on the production project. Live alias checks verified the final bundle hash, community/studio/channel pages, channel feed API, R2-enabled configuration, expected 404s, primary-origin unauthenticated rejection and cross-origin rejection. The primary custom domain was verified through the Cloudflare project configuration rather than a direct browser fetch.
