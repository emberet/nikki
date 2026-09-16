# Nikki’s first creator drop

**Status: founder signature accepted; video and signed metadata uploaded. Waiting for Arweave block confirmation and gateway verification before deployment.**

## Prepared content

- Caption / record title: **Nikki is live?**
- Film: `releases/creator-drop/Nikki-Launch-15s.mp4`
- Poster: `releases/creator-drop/Nikki-Launch-Cover.png`
- Draft metadata: `releases/creator-drop/record.json`
- Format: 15 seconds, 1080 × 1350, H.264 MP4 with AAC audio; 2,644,637 bytes.
- Video SHA-256: `36a6eec0d4cf52558b1276b0f4d0891f82406f2eeb0542f4000444f148e3ec21`.
- Category: Culture. Language: English. No claimed recording date.

The local `releases/` directory is ignored by Git and excluded from the public export. Keep this package and the original masters in `/Users/srinjoydas/Downloads/nikki-launch/` until publication is complete. It is deliberately outside the private studio’s temporary upload queue, whose unsigned submissions expire after seven days. Initial preparation did not create a database submission. After the card payment was confirmed, the film was staged as unsigned submission `cmu4ghrzc0002yiobz6qf4dd2`. The founder signed at 18:54:55 UTC on 16 September 2026; Turbo accepted both uploads. The founding record is reserved and has status `publishing`. It has not yet been added to the public site. The durable source package remains available if the unsigned database submission expires.

## Review the prepared drop

Run `npm run preview:drop`, then serve `dist-drop-preview/` on localhost. It contains a playable copy of the film, the portrait poster, and the homepage Creator drop design. It is labelled **Private preview · awaiting permanent storage**, has no-index directives, and does not alter `dist-public/` or the archive record count. Never deploy `dist-drop-preview/`.

`npm run build:public` continues to omit this drop and its media until a verified, signed founder publication matches the prepared file’s fingerprint, byte count, and title. Once that record exists, the same build adds the homepage drop with its Arweave video URL and a link to the permanent record. The local MP4 is never copied into the deployable public export.

## Complete founder publication

1. A separate operational storage signer is now configured locally via `STORAGE_KEYPAIR_PATH`, outside the repository with owner-only file permissions. Its public credit destination and payment preparation are saved in `releases/creator-drop/storage-payment.json`. Keep a secure backup of the signer file. The founder’s signing wallet and the operational storage signer have different roles; do not put a founder or treasury private key into the repository.
2. **Funding is complete.** The user paid by card; Turbo confirmed 2,589,641,434,263 winc (2.589641434263 credits) on 16 September 2026 at 18:49 UTC, against a video-and-metadata estimate of 35,242,293,018 winc. No additional payment is needed for this record. Recheck the provider balance if resuming later; the service also checks it before publication.
3. The private studio at `http://127.0.0.1:4900/studio` and one preservation worker are running with publishing enabled. Health and funding checks passed. If restarting later, follow `OPERATIONS.md`; do not run duplicate workers. Public uploads and NIKKI voting remain closed.
4. **Founder approval is complete.** The wallet signature has been cryptographically checked against the exact record. Do not submit, sign, or pay for a duplicate. The signed archive and original provider receipts are saved locally as `releases/creator-drop/signed-archive.json` and `storage-receipts.json`.
5. Wait for the worker to confirm both permanent objects and validate their sizes and SHA-256 hashes. Funding or an upload receipt alone does not make the video public. Follow storage recovery instructions if an upload is interrupted; do not pay or publish again to bypass recovery.
6. Run `npm run build:public`. Check that `archive.json` contains the verified founding record, the homepage Creator drop shows **Nikki is live?**, and its video plays from Arweave. Review desktop and mobile.
7. Deploy only `dist-public/` to the `nikki-run` Pages project when publication is authorized. The private preview, source masters, keys, and database stay local.

The remaining release steps require Arweave block inclusion and gateway verification, followed by the public-site rebuild and deployment. Payment, founder approval, and both uploads are complete. Turbo-gateway retrieval matched both uploaded objects byte for byte; the stricter Arweave confirmation check is pending. No additional upload or payment is needed.

- Video transaction: `OD5bThQU9SCsX-_5fJ2Q9HTfjpqBTExMaHVOTUjmKoc`.
- Signed record transaction: `S-GcrFCCefS4uWoRVRe4f6do_3xxQtTFAam-oScgSdY`.
- Video receipt cost: 34,386,220,820 winc. Signed metadata receipt cost: 0 winc.
- Signed metadata: 1,443 bytes; SHA-256 `21f63aca021fce9628d1ec05c2e1b6b402e52ac24443b965b30094b2a58e7271`.

## Preparation checks

- TypeScript check, all 38 existing tests, public build, and private preview build passed.
- Browser playback reached the full 15 seconds at 1080 × 1350 without media errors; native pause and timeline seeking worked.
- Desktop, 390 px, and 320 px layouts checked; the drop has no horizontal overflow. The text transcript expands correctly.
- The normal public output contains no pending drop, launch MP4, or launch poster. Both preview and public archive counts remain zero.
- The local preview sends the correct video MIME type and no-index headers. Wrangler’s local static server returns the complete small file for range requests; real Arweave playback and range support still need verification after preservation.
