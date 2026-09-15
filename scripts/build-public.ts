import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db";
import { escapeHtml as e, publicRecord } from "../lib/public-record";

async function main() {
  const root = process.cwd();
  const out = path.join(root, "dist-public");
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
  await fs.copyFile(
    path.join(root, "app/globals.css"),
    path.join(out, "theme.css"),
  );
  await write(
    "release.css",
    `[hidden]{display:none!important}html{scroll-behavior:smooth}section[id]{scroll-margin-top:24px}.release-note{margin:0 0 32px}.section-space{margin-top:64px}.intro-space{margin-top:32px}.photo-credit{margin:10px 0 0}.photo-figure{margin:0}.collection{display:block}.nav-links{margin-left:auto}.release-label{color:var(--green);white-space:nowrap}.stamp-body .footnote{margin:12px 0 0}.stamp-body .eyebrow{margin-top:12px}.empty-state{min-height:300px;background:linear-gradient(135deg,#151119,#0a0a0c)}.empty-symbol{color:var(--accent)}.rule-grid.single{grid-template-columns:1fr}.text-link{text-decoration:underline;text-underline-offset:4px}.record-video{width:100%;max-height:75vh;background:#000;border:2px solid var(--line)}.description{white-space:pre-wrap;overflow-wrap:anywhere}.record-details{overflow-wrap:anywhere}.record-details dt{color:var(--muted);font:0.75rem Space;margin-top:18px}.record-details dd{margin:4px 0 0}.filter{min-height:44px}.section-heading{flex-wrap:wrap}.privacy-copy{max-width:700px}.collection span{font-size:1.1rem;text-shadow:0 2px 5px #000}.collection img{opacity:.65}.collection:hover img{opacity:.85}.phase{font:0.75rem Space;color:var(--accent)}.record-count{font:0.75rem Space}.token-note{margin-top:24px}.empty-state .eyebrow{margin-bottom:16px}@media(max-width:640px){.release-label{display:none}.ticker{font-size:.59rem}.ticker span:nth-child(2){display:none}.hero h1{font-size:clamp(2.2rem,11vw,2.8rem)}.stamp-rules strong{font-size:1.1rem}.footer-links{flex-wrap:wrap}.nav-links{width:100%}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`,
  );
  await write(
    "favicon.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" fill="#9945ff" stroke="#ececf1" stroke-width="4"/><path d="M17 48V16h8l14 19V16h8v32h-8L25 29v19z" fill="#fff"/></svg>',
  );
  const description =
    "A permanent record of human history and knowledge, told through long-form video. Nikki’s founding chapter begins here.";
  function page(title: string, body: string, route = "/", js = false) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} — Nikki</title><meta name="description" content="${e(description)}"><meta name="theme-color" content="#0a0a0c"><link rel="canonical" href="${origin}${route}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)} — Nikki"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}${route}"><meta name="twitter:card" content="summary"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/archivo-black.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/release.css">${js ? '<script src="/archive.js" defer></script>' : ""}</head><body><a class="skip-link" href="#content">Skip to content</a><header class="nav"><a href="/" class="brand" aria-label="Nikki archive"><span class="brand-mark" aria-hidden="true">N</span><span><span class="brand-name">NIKKI</span><span class="brand-caption">THE PERMANENT RECORD</span></span></a><nav class="nav-links" aria-label="Main navigation"><a href="/#archive"${route === "/" ? ' aria-current="page"' : ""}>Archive</a><a href="/about/"${route === "/about/" ? ' aria-current="page"' : ""}>The idea ↗</a></nav><span class="eyebrow release-label">● Founding chapter</span></header><div class="ticker"><span>Human history. Shared knowledge.</span><span>Recorded for the future</span><span>Built to outlast us ↗</span></div><main id="content" class="container">${body}</main><footer class="footer"><span>© ${new Date().getFullYear()} NIKKI · A RECORD WORTH KEEPING.</span><div class="footer-links"><a href="/about/">How Nikki works ↗</a><a href="/about/#roadmap">What comes next ↗</a><a href="/privacy/">Privacy</a><a href="/about/#credits">Credits</a></div></footer></body></html>`;
  }
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
        `<a class="card video-card" href="/watch/${r.arweaveTx}/" data-record data-category="${e(r.category)}" data-search="${e((r.title + " " + r.description).toLowerCase())}"><div class="thumb"><span class="thumb-play" aria-hidden="true">▶</span><span class="thumb-label">${(Number(r.sizeBytes) / 1e6).toFixed(0)} MB</span></div><div class="meta"><span class="badge published">Founding record · Preserved</span><h3>${e(r.title)}</h3><div class="mono muted">${e(r.category)} · ${e(r.publishedAt.slice(0, 10))}</div></div></a>`,
    )
    .join("");
  await write(
    "index.html",
    page(
      "Some things deserve forever",
      `<section class="hero"><div><div class="eyebrow accent">[ 01 — THE ARCHIVE ]</div><h1>Some things<br>deserve <span>forever.</span></h1><p>The stories we tell. The things we discover. A record of human history and knowledge, preserved through video.</p><div class="btn-row"><a href="#archive" class="btn btn-primary">Explore the archive ↓</a><a href="/about/" class="btn">The idea behind Nikki ↗</a></div></div><aside class="archive-stamp" aria-label="Archive status"><div class="panel-title"><span>● Archive ledger</span><span>№ 001</span></div><div class="stamp-body"><div class="stamp-number">${String(records.length).padStart(3, "0")}</div><div><div class="eyebrow">Records preserved</div><p class="footnote">A first record. A lasting beginning.</p></div></div><div class="stamp-rules"><div><strong>Human</strong><small>HISTORY</small></div><div><strong>Shared</strong><small>KNOWLEDGE</small></div><div><strong>∞</strong><small>THE AMBITION</small></div></div></aside></section><div class="notice release-note">Nikki begins with its founder’s first video. ${records.length ? "The founding record is open to everyone." : "That video is coming soon."} Public submissions and community voting are planned for after the NIKKI token launch.</div><section id="archive" aria-labelledby="archive-title"><div class="section-heading"><h2 id="archive-title">The permanent record<span class="accent">.</span></h2><span class="eyebrow muted">${records.length} RECORDS / OPEN TO EVERYONE</span></div>${records.length ? `<div class="toolbar"><div class="filters" role="group" aria-label="Filter by category">${["All records", "History", "Knowledge", "Culture"].map((c, i) => `<button class="filter ${i === 0 ? "active" : ""}" aria-pressed="${i === 0}" data-filter="${c}">${c}</button>`).join("")}</div><div class="search"><label for="archive-search" class="sr-only">Search the archive</label><input id="archive-search" type="search" placeholder="Search stories, ideas, discoveries…"></div></div><p id="result-count" class="footnote" aria-live="polite">${records.length} records</p><div class="grid">${cards}</div><div id="no-results" class="empty-state" hidden><h3>No matching records</h3><p>Try another search or category.</p></div>` : `<div class="empty-state"><div class="eyebrow accent">THE FIRST RECORD / COMING SOON</div><div class="empty-symbol" aria-hidden="true">[ + ]</div><h3>History starts with a first record.</h3><p>Nikki’s founder will publish the first video here. A record appears only after its permanent storage has been verified.</p><a href="/about/#roadmap" class="btn">See what comes next ↗</a></div>`}</section><section class="section-space" aria-labelledby="purpose-title"><div class="section-heading"><h2 id="purpose-title">A future with a memory<span class="accent">.</span></h2><a class="eyebrow text-link" href="/about/">Read our purpose ↗</a></div>${inspiration()}</section>`,
      "/",
      records.length > 0,
    ),
  );
  await write(
    "about/index.html",
    page(
      "A future with a memory",
      `<header class="page-header"><div class="eyebrow accent">[ THE IDEA BEHIND NIKKI ]</div><h1>A future with<br>a memory<span class="accent">.</span></h1><p>Knowledge should survive the moment it was shared. Nikki is a home for creators preserving the stories, discoveries, and lived experiences that tomorrow deserves to see.</p></header>${inspiration()}<section id="credits"><p class="footnote">Photography: NASA / Neil Armstrong; Detroit Publishing Co. / Library of Congress; NOAA Ocean Exploration, Windows to the Deep 2019. Typography: Archivo Black and Space Mono, used under the SIL Open Font License. <a class="text-link" href="/fonts/archivo-black-OFL.txt">Archivo license</a> · <a class="text-link" href="/fonts/space-mono-OFL.txt">Space Mono license</a>.</p></section><section class="two-col section-space"><article><h2>From a recording to a record.</h2><p>Nikki is being built for long-form video, with context that helps future viewers understand what they are watching: who recorded it, when, and why it matters.</p><h3>What preservation means</h3><p>The video and its signed record are stored on Arweave, a decentralized network designed for permanent storage. Solana is the planned network for NIKKI governance and storage payments; the video bytes are not stored on Solana.</p><p>Nikki will provide no deletion or delisting controls for published records. A publication includes its file fingerprint and independent storage identifiers so it can be found and checked outside this website.</p><p class="muted">Permanent storage is designed to outlast this platform. It cannot guarantee that nikki.run, a playback gateway, or the underlying network will always remain available.</p><h3>Approval has a name behind it.</h3><p>The first record is signed by Nikki’s founder and will be labelled as a founding publication. In the community phase, approval will record the personal decisions of eligible voters. It is not a guarantee that every claim in a video is true.</p></article><aside class="card"><div class="eyebrow accent">The founding chapter</div><h3 class="intro-space">One video. A beginning.</h3><p>${records.length ? "The founding record has been preserved and can be watched in the archive." : "Nikki’s founder will publish the first video. Until then, the archive remains empty."}</p><p>Viewing is free. Public uploads, storage payments, and voting are closed during this chapter.</p><dl class="record-details"><dt>FOUNDER’S PUBLIC WALLET</dt><dd class="mono">${e(founder)}</dd></dl><a href="/#archive" class="btn">Open the archive →</a></aside></section><section id="roadmap" class="section-space" aria-labelledby="roadmap-title"><div class="phase">[ NEXT CHAPTER / PLANNED ]</div><h2 id="roadmap-title" class="intro-space">Built with a community.</h2><p>The NIKKI token has not launched. The following rules describe the planned community release; these features are not open yet.</p><div class="two-col"><ol class="steps"><li><div><strong>Submit a video</strong><span>Creators upload an MP4 or WebM file up to 1 GB, with its context. No NIKKI holdings will be required to contribute.</span></div></li><li><div><strong>Give humans time to review</strong><span>Eligible wallets holding more than 10 million NIKKI and linked through X before voting opens can cast one vote each over 24 hours.</span></div></li><li><div><strong>Reach a decision</strong><span>At least five wallets must vote. At least 80% must approve. Eligibility is fixed when the vote opens; results are decided at closing.</span></div></li><li><div><strong>Pay once, then preserve</strong><span>After approval, the creator pays a one-time storage fee in SOL. The video appears only after permanent storage is verified.</span></div></li></ol><aside class="card"><div class="rule-grid single"><div class="rule-card"><strong>1 billion</strong><span>Planned NIKKI supply on Solana</span></div><div class="rule-card"><strong>&gt;10 million</strong><span>Tokens needed in a voting wallet</span></div><div class="rule-card"><strong>1 wallet · 1 vote</strong><span>Each eligible wallet has equal voting power</span></div></div><p class="footnote">X sign-in confirms control of an account; it does not prove a unique human identity. Several eligible wallets may belong to one person.</p><p class="footnote">The founder-controlled treasury will be excluded from voting. A separate developer wallet can vote under the same eligibility rules.</p></aside></div><div class="notice token-note">NIKKI has no official token mint yet. This website does not offer a token sale or ask for payment.</div></section>`,
      "/about/",
    ),
  );
  await write(
    "privacy/index.html",
    page(
      "Privacy",
      `<header class="page-header"><div class="eyebrow accent">[ YOUR VISIT ]</div><h1>Privacy, simply.</h1><p>This describes Nikki’s public founding release.</p></header><div class="privacy-copy"><h2>Browsing the archive</h2><p>The public site has no accounts, wallet connection, upload form, or payment flow. Nikki adds no analytics scripts, advertising trackers, or application cookies. Fonts and photographs are served with the site.</p><h2>Hosting and external links</h2><p>Cloudflare serves the website and processes request information, such as IP addresses and browser information, to deliver and secure it. <a class="text-link" href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer" target="_blank">Cloudflare’s privacy policy ↗</a></p><p>Source links take you to other websites. When videos are available, playing one will request the video from an Arweave gateway, which can receive your IP address and browser request information.</p><h2>Published records</h2><p>Creator-approved video, context, public wallet addresses, and publication signatures are intended to be publicly accessible and permanent. Do not include private information in a future submission that you do not intend to make public.</p></div>`,
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
        `<a href="/#archive" class="eyebrow text-link">← Back to the archive</a><header class="page-header"><span class="badge published">Founding record · Preserved</span><h1>${e(r.title)}</h1><p>${e(r.category)} · Published ${e(r.publishedAt.slice(0, 10))}</p></header><video class="record-video" controls playsinline preload="metadata" src="https://arweave.net/${r.arweaveTx}">Your browser cannot play this source video. <a href="https://arweave.net/${r.arweaveTx}">Open the original file.</a></video><section class="two-col intro-space"><article><h2>About this record</h2><p class="description">${e(r.description)}</p><dl class="record-details"><dt>CREATOR</dt><dd class="mono">${e(r.creator)}</dd><dt>LANGUAGE</dt><dd>${e(r.language)}</dd>${r.recordedAt ? `<dt>RECORDED</dt><dd>${e(r.recordedAt)}</dd>` : ""}${r.source ? `<dt>SOURCE / CONTEXT</dt><dd>${e(r.source)}</dd>` : ""}</dl></article><aside class="card"><h3>Independently verifiable.</h3><p>Signed by Nikki’s founder. This record was published without a community vote.</p><dl class="record-details"><dt>FILE SHA-256</dt><dd class="mono">${r.sha256}</dd><dt>SOURCE SIZE</dt><dd>${e(r.sizeBytes)} bytes</dd></dl><div class="btn-row"><a class="btn" href="https://arweave.net/${r.arweaveTx}" target="_blank" rel="noreferrer">Original video ↗</a><a class="btn" href="https://arweave.net/${r.recordTx}" target="_blank" rel="noreferrer">Signed record ↗</a></div></aside></section>`,
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
    `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
  );
  await write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/about/", "/privacy/", ...records.map((r) => `/watch/${r.arweaveTx}/`)].map((route) => `<url><loc>${origin}${route}</loc></url>`).join("")}</urlset>`,
  );
  await write(
    "_headers",
    `/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; media-src https://arweave.net https://*.arweave.net; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Cache-Control: public, max-age=0, must-revalidate\n/fonts/*\n  Cache-Control: public, max-age=86400\n/images/*\n  Cache-Control: public, max-age=86400\n`,
  );
  console.log(
    `Built public founding archive: ${records.length} verified records, ${out}`,
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
