# Public founding release

## Deployment

- Cloudflare Pages project: `nikki-run`.
- Public origin: `https://nikki.run`. Cloudflare confirmed **Active / SSL enabled** on 15 September 2026.
- Cloudflare hostname: `https://nikki-run.pages.dev`.
- Apex DNS: CNAME `@` → `nikki-run.pages.dev`, managed through Pages custom domains.
- The archive still contains zero video records; the founder will supply the first video later.
- Public creator accounts use the Pages advanced-mode Worker and `nikki-creators` D1 database.

The public site includes creator channels linked to wallet/X, token-holder subscriptions, and explicit wallet-signed pump.fun token launch and fee collection. Creator tokens are separate from the future NIKKI governance token. The Node video publishing application remains a private operator studio. No token launch, fee collection, or permanent storage payment was executed by the deployment agent. No paid hosting plan was purchased.

See [creator deployment and recovery](CREATORS.md) for D1, secrets, transaction controls, and validation limits.

The creator upgrade is deployed as `36642dd1.nikki-run.pages.dev` from code commit `8f7b01f`. X and dedicated mainnet RPC secrets are configured, D1 is bound, and `TOKEN_LAUNCH_ENABLED=true` is effective. Production HTTP checks verified signed wallet login, live holder lookups, X authorization redirects, anonymous access controls, static pages, headers, and 404s.

## Rebuild the public archive

1. Keep the private database and environment available locally. Set `RELEASE_MODE=founder` and the configured public founder wallet.
2. Run `npm run build:public`. It exports only published founder records that match their signed metadata, with both permanent storage identifiers present. It fails if any published row is incompatible with this release.
3. Review `dist-public/archive.json`. Never edit the generated count to suggest a video exists before preservation succeeds.
4. Deploy with `npx wrangler pages deploy dist-public --project-name nikki-run --branch main`. Wrangler reads the D1 binding and public flags from `wrangler.jsonc`. Never upload the repository, `.env`, `held/`, a database, or a wallet key.
5. Check Cloudflare deployment success and custom-domain status. Check the deployed archive count, headers, and 404 response through ordinary HTTP checks.

`scripts/build-public.ts` generates the public pages, watch pages, JSON catalog, headers, and sitemap. Styling reuses `app/globals.css` plus public release overrides. Public image and font assets come from the explicit `public/images` and `public/fonts` directories. Font licenses are included.

## Add the first video later

The user will supply the video later. Its title, context, recording date, source, language, and file must be reviewed before its permanent publication. The configured founder wallet is `FcRL7KJYC1h1HLMbwZELZftxkZFAg4v5cgAKNqfFfiUC`.

1. Run the private studio and worker locally. Keep their origin local; they are not hosted at the public static domain.
2. Configure a separate storage signer with prepaid Turbo credits. Keep keys outside the repository. Configure and verify storage before setting `PUBLISHING_ENABLED=true`. Do not launch the token or enable voting for this step.
3. Sign in with the founder wallet and upload the MP4/WebM file, at most 1,000,000,000 bytes. Privately held submissions awaiting approval expire after seven days; prepare the storage service before uploading the real file.
4. Check the exact title, description, context, and file. The founder signs a separate publication message that binds the complete record and explicitly approves permanent public preservation without community voting.
5. The worker uploads the video and signed metadata. It marks the record published only after both objects have block inclusion and pass full size and SHA-256 retrieval checks. The project’s prepaid storage balance covers the first record; no creator payment transfer is required.
6. Once verified, rebuild and redeploy the static archive. Its first watch page includes the original file, permanent metadata, founder signature, and fingerprint.

Permanent storage has not been exercised with a real video yet. If preservation is interrupted, follow `OPERATIONS.md`; do not upload an additional video or reset the founding reservation to bypass an uncertain receipt. Metadata-only completion after a confirmed partial upload is an operator recovery task that must be resolved before retrying.

## Validation

- Production Next build; 27 unit/security tests and 28 isolated integration checks passed.
- Signature-aware public export tests, founder wallet gating, bounded request bodies.
- Export inspected for private files, broken internal links, inline scripts, and fabricated records.
- Deployed Pages routes return 200; unknown route returns 404; CSP and `nosniff` headers are present.
- No browser interaction or visual QA was performed.

## Next community release

Do not enable public submissions or payments merely because the static site is live. The NIKKI token, complete RPC snapshot support, hosted upload storage and worker, payment-attempt coordination across tabs, live storage acceptance, and operational recovery still require the later release work described in `OPERATIONS.md`.

## Application release upgrade

Mobile bottom navigation, focused studio panels, channel artwork/sharing, a wallet-backed saved-video library, support requests, owner transaction history and founder operations are included in the new release. R2 stores mutable channel images; D1 stores their ownership, library state and private support/audit records. Founder controls can pause new token transactions without changing archived videos. See `CREATORS.md` for quotas, caching, backup verification and remaining real-wallet/video acceptance checks.
