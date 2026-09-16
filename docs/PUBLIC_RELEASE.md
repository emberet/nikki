# Public founding release

## Deployment

- Cloudflare Pages project: `nikki-run`.
- Public origin: `https://nikki.run`. Cloudflare confirmed **Active / SSL enabled** on 15 September 2026.
- Cloudflare hostname: `https://nikki-run.pages.dev`.
- Apex DNS: CNAME `@` → `nikki-run.pages.dev`, managed through Pages custom domains.
- The archive contains one verified founding video: **Nikki is live?**, also featured in the homepage Creator drop.
- Public creator accounts use the Pages advanced-mode Worker and `nikki-creators` D1 database.

The public site includes creator channels linked to wallet/X, token-holder subscriptions, and explicit wallet-signed pump.fun token launch and fee collection. Creator tokens are separate from the future NIKKI governance token. The Node video publishing application remains a private operator studio. The user funded the first film’s permanent storage by card and signed its founder approval; the worker then uploaded and verified the film and signed record. No token launch or fee collection was executed by the deployment agent. No paid hosting plan was purchased.

See [creator deployment and recovery](CREATORS.md) for D1, secrets, transaction controls, and validation limits.

The first verified Creator drop is deployed at `https://19ada16e.nikki-run.pages.dev` and `https://nikki-run.pages.dev`. X and dedicated mainnet RPC secrets are configured, D1 is bound, and `TOKEN_LAUNCH_ENABLED=true` is effective. Earlier production HTTP checks verified signed wallet login, live holder lookups, X authorization redirects, and anonymous access controls. The current deployment passed archive, homepage, watch page, poster, headers, and 404 checks.

## Rebuild the public archive

1. Keep the private database and environment available locally. Set `RELEASE_MODE=founder` and the configured public founder wallet.
2. Run `npm run build:public`. It exports only published founder records that match their signed metadata, with both permanent storage identifiers present. It fails if any published row is incompatible with this release.
3. Review `dist-public/archive.json`. Never edit the generated count to suggest a video exists before preservation succeeds.
4. Deploy with `npx wrangler pages deploy dist-public --project-name nikki-run --branch main`. Wrangler reads the D1 binding and public flags from `wrangler.jsonc`. Never upload the repository, `.env`, `held/`, a database, or a wallet key.
5. Check Cloudflare deployment success and custom-domain status. Check the deployed archive count, headers, and 404 response through ordinary HTTP checks.

`scripts/build-public.ts` generates the public pages, watch pages, JSON catalog, headers, and sitemap. Styling reuses `app/globals.css` plus public release overrides. Public image and font assets come from the explicit `public/images` and `public/fonts` directories. Font licenses are included.

## Published first creator drop

The launch film is published with the caption **Nikki is live?**. The video and signed metadata passed Arweave block-inclusion and full retrieved-byte/hash verification, and the database recorded publication at `2026-09-16T19:08:55.897Z`. See [the permanent IDs and release evidence](CREATOR_DROP.md). The homepage plays the Arweave video and links to `/watch/OD5bThQU9SCsX-_5fJ2Q9HTfjpqBTExMaHVOTUjmKoc/`. Local originals, receipts, keys, and the private preview are excluded from deployment.

## Founder publication flow (completed)

The first film completed the flow below. This documents the process; do not repeat its payment, upload, or signature, or reset its reservation. The configured founder wallet is `FcRL7KJYC1h1HLMbwZELZftxkZFAg4v5cgAKNqfFfiUC`.

1. Run the private studio and worker locally. Keep their origin local; they are not hosted at the public static domain.
2. Configure a separate storage signer with prepaid Turbo credits. Keep keys outside the repository. Configure and verify storage before setting `PUBLISHING_ENABLED=true`. Do not launch the token or enable voting for this step.
3. Sign in with the founder wallet and upload the MP4/WebM file, at most 1,000,000,000 bytes. Privately held submissions awaiting approval expire after seven days; prepare the storage service before uploading the real file.
4. Check the exact title, description, context, and file. The founder signs a separate publication message that binds the complete record and explicitly approves permanent public preservation without community voting.
5. The worker uploads the video and signed metadata. It marks the record published only after both objects have block inclusion and pass full size and SHA-256 retrieval checks. The project’s prepaid storage balance covers the first record; no creator payment transfer is required.
6. Once verified, rebuild and redeploy the static archive. Its first watch page includes the original file, permanent metadata, founder signature, and fingerprint.

The 2,644,637-byte, 15-second founding film completed real permanent storage and retrieval checks. This does not validate representative 1 GB uploads or community payment/recovery flows. For any future interrupted preservation, follow `OPERATIONS.md`; do not upload an additional video or reset the founding reservation to bypass an uncertain receipt. Metadata-only completion after a confirmed partial upload remains an operator recovery task.

## Storage pricing preview

Creator studio includes a live SOL storage estimator with 100 MB, 500 MB, and 1 GB presets and a size slider. The private video studio also uses the selected file’s size without uploading it to obtain an estimate. Rates come from Turbo’s public pricing service, carry a checked time, and expire after 15 minutes. If fresh rates are unavailable, the interface shows a retry state instead of a saved price.

The display separates fee recipients: Turbo credits fund storage on Arweave, Solana receives the separate network transaction fee, and Nikki adds no platform markup or monthly storage fee. In the planned public payment flow, creators send SOL to the operational payment wallet shown at checkout to cover prepaid Turbo storage credits; the payment is not a direct transfer to Arweave. The first founder video remains project funded.

This is a size-based preview, not a payment quote. It includes a small video storage overhead allowance; metadata storage, provider per-item charges, and network fees are additional. Creators review the final quote after approval, with the existing 15-minute quote expiry. **Public video uploads and storage payments remain closed.** This preview does not enable submission, charge a wallet, or change publication gates. See [Turbo pricing](https://docs.ar.io/build/upload/turbo-credits#pricing--fees).

## Validation

- Production Next build; 38 unit/security tests passed after the pricing update. The initial founding release also passed 28 isolated integration checks.
- Signature-aware public export tests, founder wallet gating, bounded request bodies.
- Export inspected for private files, broken internal links, inline scripts, and fabricated records.
- Deployed Pages routes return 200; unknown route returns 404; CSP and `nosniff` headers are present.
- Pricing update: current Turbo rates verified in the Cloudflare local runtime; desktop, 390 px and 320 px layouts, size presets, keyboard slider input, and fee disclosure checked in browser.
- First film: both permanent objects verified through block inclusion and full retrieval/hash checks. The public export contains exactly one signed record and no private files; the deployed Creator drop completed 15-second playback from Arweave at 1080 × 1350. See `CREATOR_DROP.md` for current playback and gateway details.

## Next community release

Do not enable public submissions or payments merely because the static site is live. The NIKKI token, complete RPC snapshot support, hosted upload storage and worker, payment-attempt coordination across tabs, large-file/community-flow acceptance, and operational recovery still require the later release work described in `OPERATIONS.md`.

## Application release upgrade

Mobile bottom navigation, focused studio panels, channel artwork/sharing, a wallet-backed saved-video library, support requests, owner transaction history and founder operations are included in the new release. R2 stores mutable channel images; D1 stores their ownership, library state and private support/audit records. Founder controls can pause new token transactions without changing archived videos. See `CREATORS.md` for quotas, caching, backup verification and remaining real-wallet/video acceptance checks.
