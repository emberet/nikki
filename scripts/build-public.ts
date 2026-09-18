import { communitiesPage, communityPage } from "../public-site/communities";
import { landingHero } from "../public-site/landing";
import { creatorDrop } from "../public-site/creator-drop";
import { nikkiSocialLink, nikkiSocialLinks } from "../public-site/nikki-social";
import { nikkiCreatorToken } from "../public-site/nikki-token";
import { launchDrop } from "../lib/launch-drop";
import { communitiesDrop } from "../lib/communities-drop";
import { createHash } from "node:crypto";
import {
  helpPage,
  libraryPage,
  moderatorsPage,
  opsPage,
} from "../public-site/experience";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db";
import {
  creatorsPage,
  creatorStudioPage,
  subscriptionsPage,
  channelPage,
  creatorDialogs,
} from "../public-site/creators";
import { build } from "esbuild";
import { mobileNavigation, appMenu, icon } from "../public-site/app-shell";
import { escapeHtml as e, publicRecord } from "../lib/public-record";

async function main() {
  const root = process.cwd();
  // A payment-pending preview must never overwrite the deployable export.
  const previewDrop = process.argv.includes("--preview-creator-drop");
  const previewCommunities = process.argv.includes(
    "--preview-communities-drop",
  );
  const privatePreview = previewDrop || previewCommunities;
  const out = path.join(
    root,
    privatePreview ? "dist-drop-preview" : "dist-public",
  );
  const origin = "https://nikki.run";
  const founder = process.env.FOUNDER_WALLET;
  if (!founder || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(founder))
    throw Error("Set FOUNDER_WALLET to the public founder address.");
  if (process.env.RELEASE_MODE !== "founder")
    throw Error("Public export currently supports the founding release only.");
  const videos = await db.video.findMany({
    where: { status: "published" },
    include: { creator: true, founderRecord: true },
    orderBy: { publishedAt: "desc" },
  });
  const records = videos.map((video) => publicRecord(video, founder));
  const dropRecord = records.find(
    (record) =>
      record.sha256 === launchDrop.sha256 &&
      record.title === launchDrop.title &&
      record.sizeBytes === String(launchDrop.sizeBytes),
  );
  const communitiesRecord = records.find(
    (record) =>
      record.sha256 === communitiesDrop.sha256 &&
      record.title === communitiesDrop.title &&
      record.sizeBytes === String(communitiesDrop.sizeBytes),
  );
  async function checkedDropAsset(
    name: string,
    hash: string,
    folder = "creator-drop",
  ) {
    const bytes = await fs.readFile(path.join(root, "releases", folder, name));
    if (createHash("sha256").update(bytes).digest("hex") !== hash)
      throw Error("The prepared creator-drop asset has changed: " + name);
    return bytes;
  }
  const dropVideo = previewDrop
    ? await checkedDropAsset("Nikki-Launch-15s.mp4", launchDrop.sha256)
    : undefined;
  const dropPoster =
    previewDrop || dropRecord
      ? await checkedDropAsset(
          "Nikki-Launch-Cover.png",
          launchDrop.posterSha256,
        )
      : undefined;
  const communitiesPoster =
    previewCommunities || communitiesRecord
      ? await checkedDropAsset(
          "Nikki-Communities-Cover.png",
          communitiesDrop.posterSha256,
          "creator-drop-002",
        )
      : undefined;
  const communitiesVideo = previewCommunities
    ? await checkedDropAsset(
        "Nikki-Communities-30s.mp4",
        communitiesDrop.sha256,
        "creator-drop-002",
      )
    : undefined;
  await db.$disconnect();
  await fs.mkdir(out, { recursive: true });
  // Clear only the generated directory, after all database records pass validation.
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  async function write(name: string, content: string) {
    const file = path.join(out, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  for (const name of ["fonts", "images"])
    await fs.cp(path.join(root, "public", name), path.join(out, name), {
      recursive: true,
    });
  if (dropPoster)
    await fs.writeFile(
      path.join(out, "images/nikki-launch-cover.png"),
      dropPoster,
    );
  if (communitiesPoster)
    await fs.writeFile(
      path.join(out, "images/nikki-communities-cover.png"),
      communitiesPoster,
    );
  if (communitiesVideo) {
    await fs.mkdir(path.join(out, "media"), { recursive: true });
    await fs.writeFile(
      path.join(out, "media/nikki-communities-30s.mp4"),
      communitiesVideo,
    );
  }
  if (dropVideo) {
    await fs.mkdir(path.join(out, "media"), { recursive: true });
    await fs.writeFile(path.join(out, "media/nikki-launch-15s.mp4"), dropVideo);
  }
  await fs.copyFile(
    path.join(root, "app/globals.css"),
    path.join(out, "theme.css"),
  );
  await write(
    "release.css",
    `[hidden]{display:none!important}html{scroll-behavior:smooth}section[id]{scroll-margin-top:24px}.release-note{margin:0 0 32px}.section-space{margin-top:64px}.intro-space{margin-top:32px}.photo-credit{margin:10px 0 0}.photo-figure{margin:0}.collection{display:block}.nav-links{margin-left:auto}.release-label{color:var(--green);white-space:nowrap}.stamp-body .footnote{margin:12px 0 0}.stamp-body .eyebrow{margin-top:12px}.empty-state{min-height:300px;background:linear-gradient(135deg,#151119,#0a0a0c)}.empty-symbol{color:var(--accent)}.rule-grid.single{grid-template-columns:1fr}.text-link{text-decoration:underline;text-underline-offset:4px}.record-video{width:100%;max-height:75vh;background:#000;border:2px solid var(--line)}.description{white-space:pre-wrap;overflow-wrap:anywhere}.record-details{overflow-wrap:anywhere}.record-details dt{color:var(--muted);font:0.75rem Space;margin-top:18px}.record-details dd{margin:4px 0 0}.filter{min-height:44px}.section-heading{flex-wrap:wrap}.privacy-copy{max-width:700px}.collection span{font-size:1.1rem;text-shadow:0 2px 5px #000}.collection img{opacity:.65}.collection:hover img{opacity:.85}.phase{font:0.75rem Space;color:var(--accent)}.record-count{font:0.75rem Space}.token-note{margin-top:24px}.empty-state .eyebrow{margin-bottom:16px}@media(max-width:640px){.release-label{display:none}.ticker{font-size:.59rem}.ticker span:nth-child(2){display:none}.hero h1{font-size:clamp(2.2rem,11vw,2.8rem)}.stamp-rules strong{font-size:1.1rem}.footer-links{flex-wrap:wrap}.nav-links{width:100%}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`,
  );
  const description =
    "A permanent record of human history and knowledge, told through long-form video. Nikki’s founding chapter begins here.";
  function page(title: string, body: string, route = "/", js = false) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${e(title)} — Nikki</title><meta name="description" content="${e(description)}"><meta name="theme-color" content="#0a0a0c">${privatePreview ? '<meta name="robots" content="noindex,nofollow">' : ""}<link rel="canonical" href="${origin}${route}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)} — Nikki"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}${route}"><meta name="twitter:card" content="summary"><link rel="icon" href="/images/nikki-logo.jpg" type="image/jpeg"><link rel="preload" href="/fonts/archivo-black.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/release.css"><link rel="stylesheet" href="/creators.css"><link rel="stylesheet" href="/channel-posts.css"><link rel="stylesheet" href="/experience.css">${route.startsWith("/communities/") ? '<link rel="stylesheet" href="/communities.css">' : ""}${route === "/creator-studio/" ? '<link rel="stylesheet" href="/storage-pricing.css"><script src="/storage-pricing-client.js" type="module"></script>' : ""}${route === "/" ? '<link rel="stylesheet" href="/landing.css"><link rel="stylesheet" href="/creator-drop.css"><link rel="preload" href="/images/nikki-logo.jpg" as="image"><script src="/landing-client.js" type="module"></script>' : ""}<script src="/creator-client.js" type="module"></script>${js ? '<script src="/archive.js" defer></script>' : ""}</head><body><a class="skip-link" href="#content">Skip to content</a><header class="nav"><a href="/" class="brand" aria-label="Nikki archive"><img class="brand-mark brand-logo" src="/images/nikki-logo.jpg" width="44" height="44" alt=""><span><span class="brand-name">NIKKI</span><span class="brand-caption">THE PERMANENT RECORD</span></span></a><nav class="nav-links" aria-label="Main navigation"><a href="/#archive"${route === "/" ? ' aria-current="page"' : ""}>Archive</a><a href="/creators/">Creators</a><a href="/communities/"${route.startsWith("/communities/") ? ' aria-current="page"' : ""}>Communities</a><a href="/creator-studio/">Studio</a></nav><button class="btn btn-small creator-connect" data-connect>Connect wallet ↗</button><button id="motion-toggle" class="motion-toggle" aria-pressed="true">Motion: on</button><button class="app-menu-button" data-open-menu aria-label="Open menu">${icon("menu")}</button></header><div class="ticker"><span>Human history. Shared knowledge.</span><span>Recorded for the future</span><span>Built to outlast us ↗</span></div><main id="content" class="container">${body}</main><footer class="footer"><span>© ${new Date().getFullYear()} NIKKI · A RECORD WORTH KEEPING.</span><div class="footer-links"><a href="/about/">How Nikki works ↗</a><a href="/about/#roadmap">What comes next ↗</a><a href="/communities/">Communities</a><a href="/help/">Help & reports</a><a href="/moderators/">Moderators</a><a href="/library/">Library</a><a href="/privacy/">Privacy</a><a href="/about/#credits">Credits</a><a href="https://x.com/nikkistreams" target="_blank" rel="noopener noreferrer" aria-label="Nikki on X (opens in a new tab)">𝕏 ↗</a><a href="https://www.tiktok.com/@nikkistreams" target="_blank" rel="noopener noreferrer" aria-label="Nikki on TikTok (opens in a new tab)">TikTok ↗</a><a href="https://www.instagram.com/nikki_streams/" target="_blank" rel="noopener noreferrer" aria-label="Nikki on Instagram (opens in a new tab)">Instagram ↗</a></div></footer>${mobileNavigation(route)}${appMenu()}${creatorDialogs()}</body></html>`;
  }
  await fs.copyFile(
    path.join(root, "public-site/channel-posts.css"),
    path.join(out, "channel-posts.css"),
  );
  await fs.copyFile(
    path.join(root, "public-site/creators.css"),
    path.join(out, "creators.css"),
  );
  await fs.copyFile(
    path.join(root, "public-site/experience.css"),
    path.join(out, "experience.css"),
  );
  await fs.copyFile(
    path.join(root, "public-site/landing.css"),
    path.join(out, "landing.css"),
  );
  await fs.copyFile(
    path.join(root, "public-site/creator-drop.css"),
    path.join(out, "creator-drop.css"),
  );
  await fs.copyFile(
    path.join(root, "public-site/storage-pricing.css"),
    path.join(out, "storage-pricing.css"),
  );
  await fs.copyFile(
    path.join(root, "public-site/communities.css"),
    path.join(out, "communities.css"),
  );
  await write(
    "communities/index.html",
    page("Communities", communitiesPage(), "/communities/"),
  );
  await write(
    "communities/_community/index.html",
    page("Community", communityPage(), "/communities/detail/"),
  );
  await write(
    "creators/index.html",
    page("Creators", creatorsPage(), "/creators/"),
  );
  await write(
    "creator-studio/index.html",
    page("Creator studio", creatorStudioPage(), "/creator-studio/"),
  );
  await write(
    "subscriptions/index.html",
    page("Subscriptions", subscriptionsPage(), "/subscriptions/"),
  );
  await write("c/index.html", page("Creator channel", channelPage(), "/c/"));
  await write("help/index.html", page("Help & reports", helpPage(), "/help/"));
  await write(
    "library/index.html",
    page("Your library", libraryPage(), "/library/"),
  );
  await write("ops/index.html", page("Founder operations", opsPage(), "/ops/"));
  await write(
    "moderators/index.html",
    page("Moderators", moderatorsPage(), "/moderators/"),
  );
  const bundleOptions = {
    bundle: true,
    format: "esm" as const,
    platform: "browser" as const,
    target: "es2022",
    inject: [path.join(root, "public-site/polyfills.ts")],
    define: { global: "globalThis", "process.env.NODE_ENV": '"production"' },
    minify: true,
  };
  await build({
    ...bundleOptions,
    entryPoints: [path.join(root, "creator-worker/index.ts")],
    outfile: path.join(out, "_worker.js"),
  });
  await build({
    ...bundleOptions,
    entryPoints: [path.join(root, "public-site/creator-client.ts")],
    outfile: path.join(out, "creator-client.js"),
  });
  await build({
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    entryPoints: [path.join(root, "public-site/landing-client.ts")],
    outfile: path.join(out, "landing-client.js"),
  });
  await build({
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    entryPoints: [path.join(root, "public-site/storage-pricing-client.ts")],
    outfile: path.join(out, "storage-pricing-client.js"),
  });
  await write(
    "_routes.json",
    JSON.stringify({
      version: 1,
      include: ["/api/creators/*", "/c/*", "/communities", "/communities/*"],
      exclude: [],
    }),
  );
  const photos = [
    [
      "apollo-11.jpg",
      "The things we discover",
      "Buzz Aldrin on the Moon during Apollo 11",
      "NASA · Apollo 11, 1969",
      "https://science.nasa.gov/resource/apollo-11-buzz-aldrin/",
    ],
    [
      "mulberry-street.jpg",
      "The lives we lead",
      "Crowded Mulberry Street in New York around 1900",
      "Library of Congress · New York, c. 1900",
      "https://www.loc.gov/pictures/item/2016794146/",
    ],
    [
      "jellyfish.jpg",
      "The world we inherit",
      "A jellyfish observed during deep-sea exploration",
      "NOAA Ocean Exploration · 2019",
      "https://oceanexplorer.noaa.gov/multimedia/daily-image-media-20200903/",
    ],
  ];
  function inspiration() {
    return `<div class="collection-grid">${photos.map(([file, title, alt, credit, url]) => `<figure class="photo-figure"><a href="${url}" class="collection" target="_blank" rel="noreferrer"><img src="/images/${file}" alt="${e(alt)}" loading="lazy" width="800" height="500"><span>${e(title)} ↗</span></a><figcaption class="footnote photo-credit">${e(credit)}</figcaption></figure>`).join("")}</div><p class="footnote intro-space">Archival photographs, shared as inspiration. Follow each image to its original source. These are not video publications on Nikki.</p>`;
  }
  const cards = records
    .map(
      (r) =>
        `<a class="card video-card" href="/watch/${r.arweaveTx}/" data-record data-category="${e(r.category)}" data-search="${e((r.title + " " + r.description).toLowerCase())}"><div class="thumb"><span class="thumb-play" aria-hidden="true">▶</span><span class="thumb-label">${(Number(r.sizeBytes) / 1e6).toFixed(0)} MB</span></div><div class="meta"><span class="badge published">Founder record · Preserved</span><h3>${e(r.title)}</h3><div class="mono muted">${e(r.category)} · ${e(r.publishedAt.slice(0, 10))}</div></div></a>`,
    )
    .join("");
  const secondDrop =
    previewCommunities || communitiesRecord
      ? creatorDrop({
          id: "creator-drop-002",
          number: 2,
          title: communitiesDrop.title,
          src: previewCommunities
            ? "/media/nikki-communities-30s.mp4"
            : `https://arweave.net/${communitiesRecord!.arweaveTx}`,
          preview: previewCommunities,
          watchUrl: communitiesRecord
            ? `/watch/${communitiesRecord.arweaveTx}/`
            : undefined,
          poster: "/images/nikki-communities-cover.png",
          intro: "Your token. Your corner.\nMeet Nikki Communities.",
          durationSeconds: communitiesDrop.durationSeconds,
          filmLabel: "PRESS PLAY. BRING YOUR PEOPLE.",
          description:
            "A 30-second animated introduction to Nikki Communities, with an original 144 BPM soundtrack and no spoken dialogue.",
          transcript: [
            {
              time: "00:00",
              text: "Your token. New hangout. Bring your people.",
            },
            {
              time: "00:03",
              text: "Meet Communities. Your token crew found a home.",
            },
            {
              time: "00:07",
              text: "Got a token? Bring it. Existing Solana tokens welcome.",
            },
            {
              time: "00:10",
              text: "Same identity. New space. Import your name, logo, and links.",
            },
            { time: "00:13", text: "Your community. Your corner." },
            {
              time: "00:17",
              text: "Post text and images. For free. Everyday posts are removable; permanent video storage is separate.",
            },
            {
              time: "00:20",
              text: "Wallet. X. You. Pair both. Start posting.",
            },
            {
              time: "00:23",
              text: "Find your people. Explore. Join. Say hello.",
            },
            {
              time: "00:27",
              text: "Nikki Communities. Your token. Your corner. Come through: nikki.run/communities.",
            },
          ],
        })
      : "";
  await write(
    "index.html",
    page(
      "A thing for forever",
      `${privatePreview ? '<div class="notice release-note"><strong>PRIVATE PREVIEW · NOT PUBLISHED</strong> — Awaiting founder approval and verified permanent storage.</div>' : ""}${landingHero()}${previewDrop || dropRecord ? creatorDrop({ title: launchDrop.title, src: previewDrop ? "/media/nikki-launch-15s.mp4" : `https://arweave.net/${dropRecord!.arweaveTx}`, preview: previewDrop, watchUrl: dropRecord ? `/watch/${dropRecord.arweaveTx}/` : undefined }) : ""}${secondDrop}<div class="notice release-note"><span class="status-dot" aria-hidden="true"></span><span>Creator channels and <a class="text-link" href="/communities/">communities</a> are open. ${records.length ? "The founder drops are ready to watch." : "The first permanent record is on its way."} Public video uploads open in a later release.</span></div><section id="archive" aria-labelledby="archive-title"><div class="section-heading"><h2 id="archive-title">The permanent record<span class="accent">.</span></h2><span class="eyebrow muted">${records.length} RECORDS / OPEN TO EVERYONE</span></div>${records.length ? `<div class="toolbar"><div class="filters" role="group" aria-label="Filter by category">${["All records", "History", "Knowledge", "Culture"].map((c, i) => `<button class="filter ${i === 0 ? "active" : ""}" aria-pressed="${i === 0}" data-filter="${c}">${c}</button>`).join("")}</div><div class="search"><label for="archive-search" class="sr-only">Search the archive</label><input id="archive-search" type="search" placeholder="Search stories, ideas, discoveries…"></div></div><p id="result-count" class="footnote" aria-live="polite">${records.length} records</p><div class="grid">${cards}</div><div id="no-results" class="empty-state" hidden><h3>No matching records</h3><p>Try another search or category.</p></div>` : `<div class="empty-state"><div class="eyebrow accent">THE FIRST RECORD / COMING SOON</div><div class="empty-symbol" aria-hidden="true">[ ▶ ]</div><h3>Something worth waiting up for.</h3><p>Nikki’s founder will publish the first permanent record here. A record appears only after its permanent storage has been verified.</p><a href="/about/#roadmap" class="btn">See what comes next ↗</a></div>`}</section><section class="section-space" aria-labelledby="purpose-title"><div class="section-heading"><h2 id="purpose-title">A future with a memory<span class="accent">.</span></h2><a class="eyebrow text-link" href="/about/">Read our purpose ↗</a></div>${inspiration()}</section>`,
      "/",
      records.length > 0,
    ),
  );
  await write(
    "about/index.html",
    page(
      "A future with a memory",
      `<header class="page-header"><div class="eyebrow accent">[ THE IDEA BEHIND NIKKI ]</div><h1>A future with<br>a memory<span class="accent">.</span></h1><p>Knowledge should survive the moment it was shared. Nikki is a home for creators preserving the stories, discoveries, and lived experiences that tomorrow deserves to see.</p></header>${inspiration()}<section id="credits"><p class="footnote">Photography: NASA / Neil Armstrong; Detroit Publishing Co. / Library of Congress; NOAA Ocean Exploration, Windows to the Deep 2019. Typography: Archivo Black and Space Mono, used under the SIL Open Font License. <a class="text-link" href="/fonts/archivo-black-OFL.txt">Archivo license</a> · <a class="text-link" href="/fonts/space-mono-OFL.txt">Space Mono license</a>.</p></section><section class="two-col section-space"><article><h2>From a recording to a record.</h2><p>Nikki is being built for long-form video, with context that helps future viewers understand what they are watching: who recorded it, when, and why it matters.</p><h3>What preservation means</h3><p>The video and its signed record are stored on Arweave, a decentralized network designed for permanent storage. Solana is the planned network for NIKKI governance and storage payments; the video bytes are not stored on Solana.</p><p>Nikki will provide no deletion or delisting controls for published records. A publication includes its file fingerprint and independent storage identifiers so it can be found and checked outside this website.</p><p class="muted">Permanent storage is designed to outlast this platform. It cannot guarantee that nikki.run, a playback gateway, or the underlying network will always remain available.</p><h3>Approval has a name behind it.</h3><p>Founder records are signed by Nikki’s founder and labelled as founder publications. In the community phase, approval will record the personal decisions of eligible voters. It is not a guarantee that every claim in a video is true.</p></article><aside class="card"><div class="eyebrow accent">The founding chapter</div><h3 class="intro-space">The first stories. A beginning.</h3><p>${records.length ? "The founder records have been preserved and can be watched in the archive." : "Nikki’s founder will publish the first video. Until then, the archive remains empty."}</p><p>Viewing is free. Wallet-and-X creator channels and creator tokens are available separately. Public video uploads, storage payments, and NIKKI voting are closed during this chapter.</p><dl class="record-details"><dt>FOUNDER’S PUBLIC WALLET</dt><dd class="mono">${e(founder)}</dd></dl><a href="/#archive" class="btn">Open the archive →</a></aside></section><section id="roadmap" class="section-space" aria-labelledby="roadmap-title"><div class="phase">[ NEXT CHAPTER / PLANNED ]</div><h2 id="roadmap-title" class="intro-space">Built with a community.</h2><p>NIKKI community governance has not launched. The following rules describe the planned community release; these features are not open yet.</p><div class="two-col"><ol class="steps"><li><div><strong>Submit a video</strong><span>Creators upload an MP4 or WebM file up to 1 GB, with its context. No NIKKI holdings will be required to contribute.</span></div></li><li><div><strong>Give humans time to review</strong><span>Eligible wallets holding more than 10 million NIKKI and linked through X before voting opens can cast one vote each over 24 hours.</span></div></li><li><div><strong>Reach a decision</strong><span>At least five wallets must vote. At least 80% must approve. Eligibility is fixed when the vote opens; results are decided at closing.</span></div></li><li><div><strong>Pay once, then preserve</strong><span>After approval, the creator pays a one-time storage fee in SOL. The video appears only after permanent storage is verified.</span></div></li></ol><aside class="card"><div class="rule-grid single"><div class="rule-card"><strong>1 billion</strong><span>Planned NIKKI supply on Solana</span></div><div class="rule-card"><strong>&gt;10 million</strong><span>Tokens needed in a voting wallet</span></div><div class="rule-card"><strong>1 wallet · 1 vote</strong><span>Each eligible wallet has equal voting power</span></div></div><p class="footnote">X sign-in confirms control of an account; it does not prove a unique human identity. Several eligible wallets may belong to one person.</p><p class="footnote">The founder-controlled treasury will be excluded from voting. A separate developer wallet can vote under the same eligibility rules.</p></aside></div><div class="notice token-note">Nikki’s creator token is linked on the founding Creator drop. Community governance is a later release: holding a creator token does not currently grant voting rights. Creators can launch through pump.fun, and their own wallets receive eligible trading fees.</div></section>`,
      "/about/",
    ),
  );
  await write(
    "privacy/index.html",
    page(
      "Privacy",
      `<header class="page-header"><div class="eyebrow accent">[ YOUR VISIT ]</div><h1>Privacy, simply.</h1><p>This describes Nikki’s public founding release.</p></header><div class="privacy-copy"><h2>Browsing the archive</h2><p>Creator accounts use a signed wallet message and an optional X verification flow. Nikki stores your public wallet address, X account identifier and username, channel details, and token launch records in Cloudflare D1. A secure session cookie keeps you signed in. A browser preference remembers whether animations are enabled. Nikki adds no advertising trackers or analytics scripts. Fonts and photographs are served with the site.</p><h2>Your channel and library</h2><p>Channel photos and covers are stored in Cloudflare R2. Published channel artwork is public; draft artwork is visible only to its owner. Saved video IDs and playback positions are stored with your wallet in D1 to support watching across devices. You can remove a saved video in your library. Support requests and founder replies are visible only to the requesting wallet and Nikki’s founder; keep secrets and unnecessary personal information out of them. Founder actions are recorded in a private operations log.</p><h2>Your communities and posts</h2><p>Community profiles, token addresses, organizer wallets, membership records, and channel/community posts are stored in Cloudflare D1. Device-uploaded community artwork and post images are resized in the browser and stored in Cloudflare R2. Text and image posting is free; storage limits and anti-abuse protections apply. Profiles and posts are public and display the author’s wallet and linked X identity. Joining a community is free; it does not buy tokens or give ownership rights. Text and image posts are not permanent blockchain records: authors can remove their posts, and community organizers or the founder can moderate them. Token authority badges describe checks performed at import, not an endorsement or promise about a token.</p><p>Imported logos and banners may load from external HTTPS hosts, which receive your IP address and browser request information. Nikki resolves token links through the public Dexscreener API and supported token metadata gateways. Connecting X never imports your private messages or posts. Token metadata and holder checks use the configured Solana RPC service and supported metadata gateways.</p><h2>Hosting and external links</h2><p>Cloudflare serves the website and processes request information, such as IP addresses and browser information, to deliver and secure it. <a class="text-link" href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer" target="_blank">Cloudflare’s privacy policy ↗</a></p><p>Source links take you to other websites. When videos are available, playing one will request the video from an Arweave gateway, which can receive your IP address and browser request information.</p><h2>Wallet and X connections</h2><p>X sign-in requests read access to confirm the account you control. Nikki does not store the X access token after verification or request permission to post. Token creation and fee collection require a separate transaction signed in your wallet. Private keys never leave your wallet; a new token’s mint key exists temporarily in your browser while you prepare its launch.</p><p>Checking subscriptions sends the public wallet address to a Solana RPC service. Token membership is checked from current holdings. Public channels expose their creator wallet, verified X username, profile, and linked token.</p><h2>Published records</h2><p>Creator-approved video, context, public wallet addresses, and publication signatures are intended to be publicly accessible and permanent. Do not include private information in a future submission that you do not intend to make public.</p></div>`,
      "/privacy/",
    ),
  );
  await write(
    "404.html",
    page(
      "Record not found",
      '<div class="empty-state"><div class="empty-symbol">[ 404 ]</div><h1>This page is not in the archive.</h1><p>The address may be incorrect, or the record may not have been published.</p><a class="btn btn-primary" href="/">Return to the archive →</a></div>',
      "/404.html",
    ),
  );
  for (const r of records) {
    await write(
      `watch/${r.arweaveTx}/index.html`,
      page(
        r.title,
        `<a href="/#archive" class="eyebrow text-link">← Back to the archive</a><header class="page-header"><span class="badge published">Founder record · Preserved</span><h1>${e(r.title)}</h1><p>${e(r.category)} · Published ${e(r.publishedAt.slice(0, 10))}</p></header><video data-record-id="${r.arweaveTx}" class="record-video" controls playsinline preload="metadata" src="https://arweave.net/${r.arweaveTx}">Your browser cannot play this source video. <a href="https://arweave.net/${r.arweaveTx}">Open the original file.</a></video><div class="player-tools"><button class="btn" data-save-record="${r.arweaveTx}">♡ Save for later</button><button class="btn" id="resume-video" hidden>Continue watching</button><button class="btn" data-share-url="${origin}/watch/${r.arweaveTx}/">Share video ↗</button><a class="text-link" href="/help/?topic=video">Report a concern</a><span id="playback-note" class="field-help" aria-live="polite"></span></div><section class="two-col intro-space"><article><h2>About this record</h2><p class="description">${e(r.description)}</p><dl class="record-details"><dt>CREATOR</dt><dd class="mono">${e(r.creator)}</dd>${r.arweaveTx === dropRecord?.arweaveTx || r.arweaveTx === communitiesRecord?.arweaveTx ? `<dt>CREATOR SOCIAL</dt><dd>${nikkiSocialLinks()}</dd>` : ""}<dt>LANGUAGE</dt><dd>${e(r.language)}</dd>${r.recordedAt ? `<dt>RECORDED</dt><dd>${e(r.recordedAt)}</dd>` : ""}${r.source ? `<dt>SOURCE / CONTEXT</dt><dd>${e(r.source)}</dd>` : ""}</dl>${r.arweaveTx === dropRecord?.arweaveTx || r.arweaveTx === communitiesRecord?.arweaveTx ? nikkiCreatorToken() : ""}</article><aside class="card"><h3>Independently verifiable.</h3><p>Signed by Nikki’s founder. This record was published without a community vote.</p><dl class="record-details"><dt>FILE SHA-256</dt><dd class="mono">${r.sha256}</dd><dt>SOURCE SIZE</dt><dd>${e(r.sizeBytes)} bytes</dd></dl><div class="btn-row"><a class="btn" href="https://arweave.net/${r.arweaveTx}" target="_blank" rel="noreferrer">Original video ↗</a><a class="btn" href="https://arweave.net/${r.recordTx}" target="_blank" rel="noreferrer">Signed record ↗</a></div></aside></section>`,
        `/watch/${r.arweaveTx}/`,
      ),
    );
  }
  await write(
    "archive.js",
    `'use strict';const cards=[...document.querySelectorAll('[data-record]')];const filters=[...document.querySelectorAll('[data-filter]')];const search=document.getElementById('archive-search');let category='All records';function update(){let visible=0;const query=search.value.trim().toLowerCase();for(const card of cards){card.hidden=!((category==='All records'||card.dataset.category===category)&&card.dataset.search.includes(query));if(!card.hidden)visible++}document.getElementById('result-count').textContent=visible+' record'+(visible===1?'':'s');document.getElementById('no-results').hidden=visible!==0}for(const button of filters)button.addEventListener('click',()=>{category=button.dataset.filter;for(const other of filters){const active=other===button;other.classList.toggle('active',active);other.setAttribute('aria-pressed',String(active))}update()});if(search)search.addEventListener('input',update);`,
  );
  await write(
    "archive.json",
    JSON.stringify(
      { schema: "nikki.public.v1", release: "founder", founder, records },
      null,
      2,
    ),
  );
  await write(
    "robots.txt",
    privatePreview
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
  );
  await write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/creators/", "/communities/", "/creator-studio/", "/subscriptions/", "/about/", "/privacy/", "/help/", "/moderators/", ...records.map((r) => `/watch/${r.arweaveTx}/`)].map((route) => `<url><loc>${origin}${route}</loc></url>`).join("")}</urlset>`,
  );
  await write(
    "_headers",
    `/*\n${privatePreview ? "  X-Robots-Tag: noindex, nofollow\n" : ""}  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; media-src ${privatePreview ? "'self' " : ""}https://arweave.net https://*.arweave.net; connect-src 'self'; frame-src https://connect.solflare.com https://solflare.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Cache-Control: public, max-age=0, must-revalidate\n/fonts/*\n  Cache-Control: public, max-age=86400\n/images/*\n  Cache-Control: public, max-age=86400\n`,
  );

  console.log(
    `Built ${privatePreview ? "PRIVATE creator-drop preview (do not deploy)" : "public founding archive"}: ${records.length} verified records, ${out}`,
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
