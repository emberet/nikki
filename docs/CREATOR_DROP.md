# Nikki’s first creator drop

**Status: preserved on Arweave and live in the public archive and homepage Creator drop. Production playback and desktop/mobile layout checks passed.**

Production deployment: [19ada16e.nikki-run.pages.dev](https://19ada16e.nikki-run.pages.dev/#creator-drop), also served at [nikki-run.pages.dev](https://nikki-run.pages.dev/#creator-drop). The configured public domain is `nikki.run`; this release was verified through the Cloudflare hostnames.

## Permanent record

- Caption / record title: **Nikki is live?**
- Submission: `cmu4ghrzc0002yiobz6qf4dd2`.
- Published at: `2026-09-16T19:08:55.897Z`.
- Format: 15 seconds, 1080 × 1350, H.264 MP4 with AAC audio; 2,644,637 bytes.
- Category: Culture. Language: English. No claimed recording date.
- Video transaction: `OD5bThQU9SCsX-_5fJ2Q9HTfjpqBTExMaHVOTUjmKoc`.
- Video SHA-256: `36a6eec0d4cf52558b1276b0f4d0891f82406f2eeb0542f4000444f148e3ec21`.
- Signed record transaction: `S-GcrFCCefS4uWoRVRe4f6do_3xxQtTFAam-oScgSdY`.
- Signed metadata: 1,443 bytes; SHA-256 `21f63aca021fce9628d1ec05c2e1b6b402e52ac24443b965b30094b2a58e7271`.
- Watch route: `/watch/OD5bThQU9SCsX-_5fJ2Q9HTfjpqBTExMaHVOTUjmKoc/`.

Both permanent objects have Arweave block inclusion. `verifyArchiveObjects` in `lib/storage.ts` retrieved the complete video and signed metadata from Arweave and verified their exact byte counts and SHA-256 hashes. The preservation worker marked the submission `published`; the same verification was independently rerun successfully before this release.

The founder signed the exact record at 18:54:55 UTC on 16 September 2026. The signature and signed package fingerprint passed `publicRecord` validation again during the public build and independent export review. The archived approval message matches the signed database message. This is a **founder publication without a community vote**. Public video uploads, public storage payments, and NIKKI voting remain closed.

## Payment and retained receipts

Funding is complete. The user paid by card; Turbo confirmed 2,589,641,434,263 winc (2.589641434263 credits) on 16 September 2026 at 18:49 UTC. The video-and-metadata estimate was 35,242,293,018 winc. The accepted upload receipts record these costs:

| Object          |                                 Receipt cost |
| --------------- | -------------------------------------------: |
| Video           |                          34,386,220,820 winc |
| Signed metadata |                                       0 winc |
| Total           | 34,386,220,820 winc (0.034386220820 credits) |

The card top-up funded the operational storage signer’s prepaid Turbo credits. It was separate from the founder’s wallet signature approving publication; this founding record did not require a creator SOL payment transfer. **No further payment, signature, or upload is needed. Do not repay, reupload, or create a duplicate founding submission.** Retain both receipts if any gateway or website becomes temporarily unavailable.

The separate operational signer is configured locally through `STORAGE_KEYPAIR_PATH`, outside the repository with owner-only file permissions. Keep its secure backup private. The founder’s signing wallet and operational storage signer have different roles; no founder or treasury private key belongs in the repository.

## Private source package

The following files remain local under the Git-ignored `releases/creator-drop/` directory:

- `Nikki-Launch-15s.mp4` and `Nikki-Launch-Cover.png`: prepared film and portrait poster.
- `record.json`: local release metadata and publication status.
- `storage-payment.json`: payment preparation.
- `signed-archive.json` and `storage-receipts.json`: signed archive and original provider receipts.

Retain this package and the original masters in `/Users/srinjoydas/Downloads/nikki-launch/` as operator backups. They are excluded from the public deployment. The source package is separate from the temporary upload queue and its retention policy.

`npm run preview:drop` remains a local design-preview command. Its output, `dist-drop-preview/`, intentionally retains private-preview labels and no-index directives. It is not the publication status or a deployment target. Never deploy it.

## Public export and validation

The Creator drop and its watch page display the creator’s X link, `https://x.com/nikkistreams`, and creator token mint `GxoppHqopqWPHAMzAw9QsbjyPzRwHUG5TNzvcjB7pump`, with Copy CA and pump.fun links. Finalized mainnet reads verified Token-2022 metadata Nikki / NIKKI and an official Pump curve whose creator matches the founder wallet. These are current website profile details, separate from the unchanged signed archive. This display update does not enroll the token in application holder subscriptions or enable community governance. Fee rates are dynamic and are not displayed as fixed promises.

`npm run build:public` now exports exactly one verified founding record. The build requires the published record’s title, byte count, and SHA-256 to match the prepared launch film before adding its homepage Creator drop. The homepage uses the permanent Arweave video URL and links to the watch page; the local MP4 is never copied into `dist-public/`.

Completed export checks:

- `archive.json` matches the database record after signature and signed-package validation.
- The homepage uses the exact caption **Nikki is live?**, shows **Permanent storage verified**, and links to the real permanent record.
- The watch page includes the expected video URL, signed-record URL, source byte count, and file SHA-256.
- The exported poster matches its expected SHA-256.
- Public output contains no pending-preview labels or staged MP4. Public indexing is enabled and the content-security policy allows Arweave video playback.
- All 38 exported files are expected public assets, pages, or the Cloudflare Worker. No private configuration, database, signer file, source package, or private-preview directory was exported. A sensitive-value scan found no private credentials.
- Earlier preparation checks passed TypeScript, all 38 existing tests, the public build, and private preview build. Preview playback reached all 15 seconds at 1080 × 1350, with working pause and seeking. Desktop, 390 px, and 320 px layouts had no horizontal overflow, and the text transcript expanded correctly.

Completed production checks:

- Both Cloudflare hostnames serve exactly one record, the exact homepage caption and permanent video URL, the watch page, and the poster. Expected pages return 200; an unknown route returns 404. CSP and `nosniff` headers are present.
- The deployed homepage video completed all 15 seconds from Arweave, at 1080 × 1350 with no media error. The permanent-record link opens the correct watch page with founder attribution, the video and signed metadata links, and the expected fingerprint.
- Desktop and 390 px mobile layouts were visually checked. Both 390 px and 320 px viewports have no horizontal overflow; the viewport was reset after testing.
- The Arweave gateway returned `video/mp4`. A byte-range request returned HTTP 200 with the complete 2,644,637-byte file rather than 206 partial content; its full SHA-256 still matched. Complete playback works for this small film. Gateway range support and seeking under constrained networks remain acceptance checks for long-form uploads.

For future website updates, deploy only `dist-public/` to Cloudflare Pages project `nikki-run`. The source package, private preview, signer, and database stay local. This completed record requires no further payment or upload.
