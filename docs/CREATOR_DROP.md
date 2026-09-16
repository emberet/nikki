# Nikki’s first creator drop

**Status: prepared locally; waiting for permanent-storage funding. Do not deploy the preview.**

## Prepared content

- Caption / record title: **Nikki is live?**
- Film: `releases/creator-drop/Nikki-Launch-15s.mp4`
- Poster: `releases/creator-drop/Nikki-Launch-Cover.png`
- Draft metadata: `releases/creator-drop/record.json`
- Format: 15 seconds, 1080 × 1350, H.264 MP4 with AAC audio; 2,644,637 bytes.
- Video SHA-256: `36a6eec0d4cf52558b1276b0f4d0891f82406f2eeb0542f4000444f148e3ec21`.
- Category: Culture. Language: English. No claimed recording date.

The local `releases/` directory is ignored by Git and excluded from the public export. Keep this package and the original masters in `/Users/srinjoydas/Downloads/nikki-launch/` until publication is complete. It is deliberately outside the private studio’s temporary upload queue, whose unsigned submissions expire after seven days. No database submission, founder reservation, payment, signature, storage upload, or deployment is created by preparing this package.

## Review before funding

Run `npm run preview:drop`, then serve `dist-drop-preview/` on localhost. It contains a playable copy of the film, the portrait poster, and the homepage Creator drop design. It is labelled **Private preview · awaiting permanent storage**, has no-index directives, and does not alter `dist-public/` or the archive record count. Never deploy `dist-drop-preview/`.

`npm run build:public` continues to omit this drop and its media until a verified, signed founder publication matches the prepared file’s fingerprint, byte count, and title. Once that record exists, the same build adds the homepage drop with its Arweave video URL and a link to the permanent record. The local MP4 is never copied into the deployable public export.

## Resume when storage funding is ready

1. A separate operational storage signer is now configured locally via `STORAGE_KEYPAIR_PATH`, outside the repository with owner-only file permissions. Its public credit destination and payment preparation are saved in `releases/creator-drop/storage-payment.json`. Keep a secure backup of the signer file. The founder’s signing wallet and the operational storage signer have different roles; do not put a founder or treasury private key into the repository.
2. Fund that operational signer’s **Turbo storage-credit balance** for the video and signed metadata. A SOL wallet balance alone is not the prepaid credit balance checked by Nikki. The existing founder flow uses project-prepaid storage and does not request a creator-to-Nikki SOL transfer. Check the provider’s current cost when paying; no price is locked by this draft.
3. Follow `OPERATIONS.md` to enable permanent publishing and start the private Node studio and preservation worker locally. Public uploads and NIKKI voting remain closed.
4. Sign in with the configured founder wallet in the private studio. Upload the staged MP4 using the exact title and metadata in `record.json`. Review playback and context, then sign the separate publication confirmation in the wallet. Do not change the caption or file after signing.
5. Wait for the worker to confirm both permanent objects and validate their sizes and SHA-256 hashes. Funding or an upload receipt alone does not make the video public. Follow storage recovery instructions if an upload is interrupted; do not pay or publish again to bypass recovery.
6. Run `npm run build:public`. Check that `archive.json` contains the verified founding record, the homepage Creator drop shows **Nikki is live?**, and its video plays from Arweave. Review desktop and mobile.
7. Deploy only `dist-public/` to the `nikki-run` Pages project when publication is authorized. The private preview, source masters, keys, and database stay local.

The remaining release steps require funded provider credits, the founder’s wallet signature, and successful permanent-storage verification. The storage signer and website integration are prepared; no payment or upload has been sent. Permanent publishing remains disabled until the payment is verified and publication is ready.

## Preparation checks

- TypeScript check, all 38 existing tests, public build, and private preview build passed.
- Browser playback reached the full 15 seconds at 1080 × 1350 without media errors; native pause and timeline seeking worked.
- Desktop, 390 px, and 320 px layouts checked; the drop has no horizontal overflow. The text transcript expands correctly.
- The normal public output contains no pending drop, launch MP4, or launch poster. Both preview and public archive counts remain zero.
- The local preview sends the correct video MIME type and no-index headers. Wrangler’s local static server returns the complete small file for range requests; real Arweave playback and range support still need verification after preservation.
