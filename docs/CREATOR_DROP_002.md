# Creator drop 002 — Nikki Communities

**Status: prepared locally; awaiting the founder’s publication signature. Not uploaded to permanent storage or deployed yet.**

## Prepared record

- Title: **Your token has a new hangout.**
- Submission: `cmu4nlnv30001yiq50hwndwsb`.
- Format: 30 seconds, 1080 × 1350, H.264 MP4 with original 144 BPM stereo music.
- Size: 5,544,243 bytes.
- Video SHA-256: `f57a622bca44e427715bc213cfb7a5921cf8a61c1e60a8955c8f523724beb6bf`.
- Cover SHA-256: `2b566b6f551525002b84c422e0f24c769705029b3d95d115b95024740afc160f`.
- Category: Culture. Language: English. No claimed recording date.
- Homepage anchor: `/#creator-drop-002`.
- Local release files: Git-ignored `releases/creator-drop-002/`.
- Original media masters: `/Users/srinjoydas/Downloads/nikki-communities-launch/`.

The user requested this exact film as the second creator drop. Its title, description, source, category, language, byte count, file hash, and null recording date are fixed in `lib/communities-drop.ts`. Existing prepaid Turbo credits cover the film and signed metadata; no new card top-up or creator SOL transfer is required.

## Publication gate

The original `founding-record` reservation remains unchanged. A separate `creator-drop-002` reservation permits only this exact film after the first signed archive passes validation. The founder must sign a fresh message bound to this submission and its metadata. It is a founder publication without community voting. This does not open public video uploads or payments.

The private studio at `http://127.0.0.1:4900/studio` presents **Sign & preserve creator drop** under this submission. A wallet-enabled browser must approve the message beginning **Publish Nikki’s creator drop 002**. That queues the existing preservation worker. The first film's signature must never be reused.

Once signed, retain video and record receipts, wait for both Arweave block inclusion and complete retrieval/hash verification, and only then build and deploy `dist-public/`. Preserve the original first-drop record and receipts. Do not repeat an upload if its outcome is uncertain; follow receipt reconciliation in `OPERATIONS.md`.

## Preparation checks

- Pre-publication database backup: `.backups/before-creator-drop-002.db`.
- Funding, worker health, and exact second-slot validation passed against the prepared submission.
- TypeScript, the existing test suite, and focused second-slot signature/tamper/duplicate tests passed.
- Private preview: `npm run build:public -- --preview-communities-drop`; it has no-index labels and is never a deployment target.
- Local playback reached all 30 seconds at 1080 × 1350 without a media error.
- Desktop, 390px, and 320px layouts checked; no horizontal overflow at either mobile width.
- Public build still contains only the original verified record and excludes the unsigned second drop and staged MP4.
- The original public archive remains unchanged at SHA-256 `66cac8f11a127547c2c9a133281507712b40b82589c899d8bb4bd9e6d32a728f`.

## Website presentation

The second drop has its own title, cover, 00:30 duration label, accessible transcript, and unique accessibility identifiers. Its creator X account and token match the first drop. The watch page and archive entry appear only after permanent storage is verified. The first Creator Drop / 001 remains available.
