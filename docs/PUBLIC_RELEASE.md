# Public founding release

## Deployment

- Cloudflare Pages project: `nikki-run`.
- Public origin: `https://nikki.run`. Cloudflare confirmed **Active / SSL enabled** on 15 September 2026.
- Cloudflare hostname: `https://nikki-run.pages.dev`.
- Apex DNS: CNAME `@` → `nikki-run.pages.dev`, managed through Pages custom domains.
- Release package: `releases/nikki-founding-release.zip` (generated, ignored by Git).
- The deployment contains 19 static files and zero video records at launch.
- Uploaded ZIP SHA-256: `207746edb2d02d687fe3766bd14a45e99acad04eaf5fbf143f7154788dcd9f25`.

The public site is the archive, mission, future community rules, privacy page, and credits. There are no public API routes, account sessions, upload forms, wallet prompts, or payment collection. The Node application remains a private operator studio. No paid hosting plan or storage credit purchase was made for this deployment.

## Rebuild the public archive

1. Keep the private database and environment available locally. Set `RELEASE_MODE=founder` and the configured public founder wallet.
2. Run `npm run build:public`. It exports only published founder records that match their signed metadata, with both permanent storage identifiers present. It fails if any published row is incompatible with this release.
3. Review `dist-public/archive.json`. Never edit the generated count to suggest a video exists before preservation succeeds.
4. Zip **the contents** of `dist-public/`, preserving relative paths. Upload that ZIP as a production deployment in Cloudflare Pages → `nikki-run`. Never upload the repository, `.env`, `held/`, a database, or a wallet key.
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

- Production Next build; 10 unit tests and 28 isolated integration checks passed.
- Signature-aware public export tests, founder wallet gating, bounded request bodies.
- Export inspected for private files, broken internal links, inline scripts, and fabricated records.
- Deployed Pages routes return 200; unknown route returns 404; CSP and `nosniff` headers are present.
- No browser interaction or visual QA was performed.

## Next community release

Do not enable public submissions or payments merely because the static site is live. The token, X credentials, complete RPC snapshot support, hosted upload storage and worker, payment-attempt coordination across tabs, live storage acceptance, and operational recovery still require the later release work described in `OPERATIONS.md`.
