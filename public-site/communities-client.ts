import {
  prepareImage,
  uploadImage,
  safeMediaUrl,
  type UploadedImage,
} from "./image-upload";

type Context = {
  request: (path: string, data?: unknown) => Promise<any>;
  getMe: () => any;
  connect: () => void;
  toast: (message: string) => void;
};
type Community = {
  mint: string;
  name: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  logoAssetId: string | null;
  bannerAssetId: string | null;
  websiteUrl: string;
  xUrl: string;
  telegramUrl: string;
  accent: string;
  tokenName: string;
  tokenSymbol: string;
  ownerWallet: string;
  ownerXUsername: string;
  importRole: string;
  authorityKind: string | null;
  authorityVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  postCount: number;
};
type Post = {
  image: {
    id: string;
    url: string;
    width: number;
    height: number;
    alt: string;
  } | null;
  id: string;
  text: string;
  createdAt: number;
  author: {
    wallet: string;
    displayName: string;
    handle: string | null;
    xUsername: string;
    avatarUrl: string | null;
  };
  canDelete: boolean;
  canModerate: boolean;
};
type Detail = {
  community: Community;
  joined: boolean;
  permissions: {
    canPost: boolean;
    canEdit: boolean;
    canModerate: boolean;
    canJoin: boolean;
  };
  user: { wallet: string; xUsername: string } | null;
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const colors: Record<string, string> = {
  purple: "#a56eff",
  lime: "#d6ff65",
  pink: "#ff90cb",
  blue: "#83c8ff",
};
const tone = (name: string) =>
  "community-tone-" + (Object.hasOwn(colors, name) ? name : "purple");
const short = (s: string) => s.slice(0, 5) + "…" + s.slice(-5);
const count = (n: number) =>
  Number.isFinite(n) ? Math.max(0, n).toLocaleString() : "0";
const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const role = (c: Community) =>
  `<span class="community-role${c.importRole === "token-authority" ? " community-role-authority" : ""}">${c.importRole === "token-authority" ? "✓ TOKEN AUTHORITY" : "↗ COMMUNITY-LED"}</span>`;
function safeUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443") ||
      !/^[a-z0-9.-]+$/.test(host) ||
      !host.includes(".") ||
      /^\d+(\.\d+){3}$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)
    )
      return "";
    return u.href;
  } catch {
    return "";
  }
}
function logo(value: string, name: string, className = "community-logo") {
  const url = safeMediaUrl(value);
  return `<span class="${className}" aria-hidden="true">${url ? `<img src="${escape(url)}" alt="" width="80" height="80" loading="lazy" referrerpolicy="no-referrer" data-community-image data-fallback="${escape(name.slice(0, 2).toUpperCase())}">` : escape(name.slice(0, 2).toUpperCase())}</span>`;
}
const communityLink = (mint: string) =>
  "/communities/" + encodeURIComponent(mint) + "/";
const empty = (title: string, copy: string, action = "") =>
  `<div class="community-empty"><span class="community-empty-mark" aria-hidden="true">✳</span><h3>${escape(title)}</h3><p>${escape(copy)}</p>${action}</div>`;

const importStorageKey = "nikki.community-import.v2";
function readImport() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(importStorageKey) || "null",
    );
    if (
      !value ||
      typeof value.input !== "string" ||
      value.input.length > 2048 ||
      typeof value.at !== "number" ||
      Date.now() - value.at > 30 * 60_000 ||
      value.at > Date.now()
    )
      return null;
    return value as { input: string; wallet: string; at: number };
  } catch {
    return null;
  }
}
function clearImport() {
  try {
    sessionStorage.removeItem(importStorageKey);
  } catch {}
}
function rememberImport(input: string, wallet = "") {
  let trimmed = input.trim();
  clearImport();
  if (!trimmed || trimmed.length > 2048) return;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        ![
          "pump.fun",
          "www.pump.fun",
          "dexscreener.com",
          "www.dexscreener.com",
        ].includes(url.hostname)
      )
        return;
      trimmed = url.origin + url.pathname;
    } catch {
      return;
    }
  }
  try {
    sessionStorage.setItem(
      importStorageKey,
      JSON.stringify({ input: trimmed, wallet, at: Date.now() }),
    );
  } catch {}
}

export function startCommunities(ctx: Context) {
  const root = document.querySelector<HTMLElement>("#communities-app");
  if (!root)
    return {
      accountChanged: async () => {
        const saved = readImport(),
          user = ctx.getMe()?.user;
        if (
          location.pathname === "/creator-studio/" &&
          new URLSearchParams(location.search).get("x") === "connected" &&
          saved?.wallet &&
          saved.wallet === user?.wallet &&
          user.xVerified
        )
          location.assign("/communities/?import=1");
      },
    };
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector);
  const editor = $<HTMLDialogElement>("#community-editor")!;
  const directoryView = root.dataset.communityView === "directory";
  const mint = directoryView
    ? ""
    : location.pathname.split("/").filter(Boolean)[1] || "";
  let epoch = 0,
    editorSequence = 0,
    identity: string | undefined,
    directorySequence = 0,
    feedSequence = 0;
  let communities: Community[] = [],
    nextOffset: number | null = null;
  let detail: Detail | null = null,
    posts: Post[] = [],
    nextCursor: string | null = null;
  let preview: any = null,
    editing = false,
    query = "",
    directoryLoading = false,
    feedLoading = false;
  let pendingPost: {
    text: string;
    clientId: string;
    imageId?: string;
    imageAlt?: string;
  } | null = null;
  let postImage: { blob: Blob; url: string; uploaded?: UploadedImage } | null =
    null;
  let postBusy = false,
    postImageSequence = 0,
    profileBusy = 0;
  let profileImages: Record<
    "logo" | "banner",
    { url: string; id: string | null }
  > = {
    logo: { url: "", id: null },
    banner: { url: "", id: null },
  };
  const profileImageSequences = { logo: 0, banner: 0 };
  const profileObjectUrls = new Set<string>();
  const revokeProfilePreviews = () => {
    for (const url of profileObjectUrls) URL.revokeObjectURL(url);
    profileObjectUrls.clear();
  };
  const clearPostImage = () => {
    if (postImage) URL.revokeObjectURL(postImage.url);
    postImage = null;
    postImageSequence++;
  };
  const lockPost = (locked: boolean) => {
    postBusy = locked;
    $("#community-post-form")
      ?.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
      >("input,textarea,button")
      .forEach((el) => {
        el.disabled = locked;
      });
  };
  let searchTimer: ReturnType<typeof setTimeout>;
  let importRequested =
    new URLSearchParams(location.search).get("import") === "1";
  const same = (version: number) => version === epoch;
  const me = () => ctx.getMe()?.user;
  const message = (text: string) => {
    const box = $("#community-editor-message");
    if (box) box.textContent = text;
  };
  const endpoint = () => "/communities/" + encodeURIComponent(mint);

  async function action(
    button: HTMLButtonElement | null,
    task: () => Promise<void>,
    inEditor = false,
    editorVersion = editorSequence,
  ) {
    if (button?.disabled) return;
    const version = epoch;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    if (inEditor) message("");
    try {
      await task();
    } catch (err) {
      if (same(version) && (!inEditor || editorVersion === editorSequence)) {
        const text =
          err instanceof Error
            ? err.message
            : "That did not go through. Please try again.";
        if (inEditor && editor.open) message(text);
        else ctx.toast(text);
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    }
  }

  function card(c: Community) {
    const href = communityLink(c.mint);
    return `<article class="community-card ${tone(c.accent)}">${safeMediaUrl(c.bannerUrl) ? `<img class="community-card-banner" src="${escape(safeMediaUrl(c.bannerUrl))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-community-image>` : ""}<div class="community-card-top">${logo(c.logoUrl, c.name)}<span class="community-card-symbol">$${escape(c.tokenSymbol)}</span></div><div class="community-card-body">${role(c)}<h3><a href="${href}">${escape(c.name)}</a></h3><p>${escape(c.description || "A new corner of Nikki. Come say hello.")}</p><div class="community-card-bottom"><span>${count(c.memberCount)} ${c.memberCount === 1 ? "member" : "members"} · ${count(c.postCount)} ${c.postCount === 1 ? "post" : "posts"}</span><a class="community-card-arrow" href="${href}" aria-label="Open ${escape(c.name)}">↗</a></div></div></article>`;
  }

  async function loadDirectory(more = false) {
    const box = $("#communities-results");
    if (!box || (more && (directoryLoading || nextOffset === null))) return;
    const version = epoch,
      sequence = ++directorySequence;
    directoryLoading = true;
    box.setAttribute("aria-busy", "true");
    try {
      const result = await ctx.request(
        "/communities?q=" +
          encodeURIComponent(query) +
          "&offset=" +
          (more ? nextOffset : 0),
      );
      if (!same(version) || sequence !== directorySequence) return;
      communities = more
        ? [...communities, ...result.communities]
        : result.communities;
      nextOffset = result.nextOffset;
      $("#communities-count")!.textContent =
        `${count(result.total)} ${result.total === 1 ? "COMMUNITY" : "COMMUNITIES"}`;
      box.innerHTML = communities.length
        ? `<div class="communities-grid">${communities.map(card).join("")}</div>`
        : query
          ? empty(
              "No corners found. Yet.",
              "Try a token name, symbol, or full Solana mint address.",
              '<button class="btn" data-community-clear-search>Clear search ↗</button>',
            )
          : empty(
              "First here? Make yourself at home.",
              "Bring an existing Solana token and give its people a place on Nikki. Text and image posts are free. Make yourself at home.",
              '<button class="btn btn-primary" data-community-import>Bring a community ↗</button>',
            );
      $("#communities-more")!.hidden = nextOffset === null;
    } catch (err) {
      if (!same(version) || sequence !== directorySequence) return;
      if (more)
        ctx.toast(
          err instanceof Error
            ? err.message
            : "Could not load more communities.",
        );
      else {
        $("#communities-count")!.textContent = "TRY AGAIN";
        box.innerHTML = empty(
          "Our corners are taking a moment.",
          err instanceof Error
            ? err.message
            : "The directory could not be loaded.",
          '<button class="btn" data-community-retry-directory>Try again ↻</button>',
        );
        $("#communities-more")!.hidden = true;
      }
    } finally {
      if (sequence === directorySequence) {
        directoryLoading = false;
        box.setAttribute("aria-busy", "false");
      }
    }
  }

  function links(c: Community) {
    return [
      [c.websiteUrl, "Website ↗"],
      [c.xUrl, "𝕏 ↗"],
      [c.telegramUrl, "Telegram ↗"],
    ]
      .filter(([url]) => safeUrl(url))
      .map(
        ([url, label]) =>
          `<a href="${escape(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`,
      )
      .join("");
  }

  function composer() {
    if (!me())
      return `<div class="community-composer"><h2>Got something to say?</h2><p class="field-help">Connect your wallet and pair your X account to post. Reading and joining are free.</p><button class="btn btn-primary" data-community-connect>Connect & say hello ↗</button></div>`;
    if (!me().xVerified)
      return `<div class="community-composer"><h2>Put a name to your words.</h2><p class="field-help">Pair your X account with your wallet to post here. Your posts will show your public profile.</p><a class="btn btn-primary" href="/api/creators/auth/x/start">Pair your X account ↗</a></div>`;
    if (!detail?.permissions.canPost)
      return `<div class="community-composer"><h2>Enjoy the conversation.</h2><p class="field-help">Posting is currently unavailable for this account.</p></div>`;
    return `<form class="community-composer" id="community-post-form"><div class="community-composer-heading"><strong>Say it. Show it.</strong><span>✳ ALWAYS FREE</span></div><label class="sr-only" for="community-post-text">Your post</label><textarea id="community-post-text" name="text" maxlength="2000" rows="3" placeholder="What’s happening in your corner?" aria-describedby="community-post-help community-post-counter"></textarea><div id="community-post-image-slot"></div><div class="community-composer-bottom"><label class="community-image-picker" for="community-post-image"><span aria-hidden="true">▧</span> Add image<input class="sr-only" id="community-post-image" type="file" accept="image/jpeg,image/png,image/webp"></label><span id="community-post-counter">0 / 2,000</span><button class="btn btn-primary" type="submit">Post ↗</button></div><p id="community-post-help" class="field-help">Text + images, free. Saved on Nikki and removable. Permanent video storage is separate.</p></form>`;
  }

  function renderDetail() {
    if (!detail) return;
    const c = detail.community;
    const authorityNote =
      c.importRole === "token-authority"
        ? `An on-chain token authority was checked when this community was imported${c.authorityVerifiedAt ? " on " + date(c.authorityVerifiedAt) : ""}. This is not proof of the original creator or an endorsement.`
        : "Organized by a community member. This space is not verified as the token’s official team.";
    $("#community-detail")!.innerHTML =
      `<div class="${tone(c.accent)}"><header class="community-header"><div class="community-banner${safeMediaUrl(c.bannerUrl) ? " community-banner-with-image" : ""}">${safeMediaUrl(c.bannerUrl) ? `<img src="${escape(safeMediaUrl(c.bannerUrl))}" alt="${escape(c.name)} community banner" referrerpolicy="no-referrer" data-community-image data-fallback="YOUR PEOPLE. YOUR LITTLE INTERNET.">` : "<span>YOUR PEOPLE.<br>YOUR LITTLE INTERNET.</span><strong>MAKE SOME<br>GOOD NOISE.</strong>"}</div><div class="community-identity">${logo(c.logoUrl, c.name)}<div class="community-identity-copy"><h1>${escape(c.name)}</h1><div class="community-badges"><span class="community-symbol">$${escape(c.tokenSymbol)}</span>${role(c)}<a class="community-about-jump" href="#community-about">About ↓</a></div></div><button class="btn btn-primary" data-community-join aria-pressed="${detail.joined}">${detail.joined ? "✓ Joined · Leave" : "Join the community ↗"}</button></div></header><div class="community-layout"><section class="community-feed-column" aria-labelledby="community-feed-title"><div class="community-free-bar"><span aria-hidden="true">✳</span><div><strong>Big ideas. Zero posting fees.</strong><p>Text + image posts are free. Permanent video storage is paid separately.</p></div></div><div id="community-composer-slot">${composer()}</div><button class="community-floating-post btn btn-primary" data-community-compose aria-label="Write a community post">✎ Post</button><div class="community-feed-title"><h2 id="community-feed-title">The conversation<span class="accent">.</span></h2><button class="community-text-button" data-community-refresh-posts>Refresh ↻</button></div><div id="community-posts" aria-live="polite" aria-busy="true">${empty("Pulling up a seat…", "Loading the conversation.")}</div><button class="btn communities-more" id="community-more-posts" hidden>Earlier posts ↓</button></section><aside class="community-about" id="community-about"><h2>About this corner.</h2><p class="community-description">${escape(c.description || "A community finding its voice. Come be part of the conversation.")}</p><div class="community-stats"><div><strong data-community-member-count>${count(c.memberCount)}</strong><span data-community-member-label>${c.memberCount === 1 ? "member" : "members"}</span></div><div><strong data-community-post-count>${count(c.postCount)}</strong><span data-community-post-label>${c.postCount === 1 ? "post" : "posts"}</span></div></div><p class="field-help">Joining is free. Membership here does not prove token ownership.</p>${links(c) ? `<nav class="community-links" aria-label="Community links">${links(c)}</nav>` : ""}<div class="community-token-address"><span>SOLANA TOKEN · ${escape(c.tokenName)}</span><code>${escape(c.mint)}</code><button class="btn" data-community-copy-mint>Copy token address ↗</button><a class="community-text-button" href="https://solscan.io/token/${encodeURIComponent(c.mint)}" target="_blank" rel="noopener noreferrer">View token on Solana ↗</a></div><p class="community-authority-note">${escape(authorityNote)}</p><p class="community-authority-note">Organized by ${c.ownerXUsername ? `<a href="https://x.com/${encodeURIComponent(c.ownerXUsername)}" target="_blank" rel="noopener noreferrer">@${escape(c.ownerXUsername)}</a>` : escape(short(c.ownerWallet))}. Imported profiles and links are provided by community organizers.</p>${detail.permissions.canEdit ? '<button class="btn" data-community-edit>Edit this community ↗</button>' : ""}<a class="community-text-button" href="/help/?topic=community&community=${encodeURIComponent(c.mint)}">Report this community ↗</a></aside></div></div>`;
  }

  async function loadDetail() {
    const box = $("#community-detail");
    if (!box) return;
    const version = epoch;
    box.setAttribute("aria-busy", "true");
    try {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))
        throw Error(
          "This community address is not valid. Choose a community from the directory.",
        );
      const result = await ctx.request(endpoint());
      if (!same(version)) return;
      detail = result;
      renderDetail();
      await loadPosts();
    } catch (err) {
      if (!same(version)) return;
      box.innerHTML = empty(
        "This corner isn’t ready to open.",
        err instanceof Error
          ? err.message
          : "The community could not be loaded.",
        '<div class="btn-row"><button class="btn" data-community-retry-detail>Try again ↻</button><a class="btn btn-primary" href="/communities/">Explore communities ↗</a></div>',
      );
    } finally {
      if (same(version)) box.setAttribute("aria-busy", "false");
    }
  }

  function postMarkup(p: Post) {
    const a = p.author;
    const avatarUrl =
      a.avatarUrl &&
      /^\/api\/creators\/media\/[a-zA-Z0-9_-]+$/.test(a.avatarUrl)
        ? a.avatarUrl
        : safeUrl(a.avatarUrl);
    const profile =
      a.handle && /^[a-z][a-z0-9_]{2,23}$/.test(a.handle)
        ? `/c/${encodeURIComponent(a.handle)}/`
        : a.xUsername
          ? `https://x.com/${encodeURIComponent(a.xUsername)}`
          : "";
    const name =
      a.displayName || (a.xUsername ? "@" + a.xUsername : short(a.wallet));
    return `<article class="community-post" data-community-post="${escape(p.id)}"><div class="community-post-heading"><span class="community-post-avatar" aria-hidden="true">${avatarUrl ? `<img src="${escape(avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-community-image data-fallback="${escape(name.slice(0, 2).toUpperCase())}">` : escape(name.slice(0, 2).toUpperCase())}</span><div class="community-post-author"><strong>${escape(name)}</strong>${profile ? `<a href="${escape(profile)}"${profile.startsWith("https:") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escape(a.xUsername ? "@" + a.xUsername : "@" + a.handle)} ↗</a>` : `<span>${escape(short(a.wallet))}</span>`}</div><time datetime="${escape(new Date(p.createdAt * 1000).toISOString())}">${escape(date(p.createdAt))}</time></div>${p.text ? `<p class="community-post-text">${escape(p.text)}</p>` : ""}${p.image && safeMediaUrl(p.image.url) ? `<a class="community-post-image-link" href="${escape(safeMediaUrl(p.image.url))}" target="_blank" rel="noopener noreferrer" aria-label="Open post image"><img class="community-post-image" src="${escape(safeMediaUrl(p.image.url))}" alt="${escape(p.image.alt || "Image shared in the community")}" width="${Number(p.image.width) || 800}" height="${Number(p.image.height) || 600}" loading="lazy" referrerpolicy="no-referrer"></a>` : ""}<div class="community-post-actions">${p.canDelete || p.canModerate ? `<button class="community-text-button" data-community-remove="${escape(p.id)}">${p.canDelete ? "Delete your post" : "Remove post"}</button>` : `<a class="community-text-button" href="/help/?topic=community&community=${encodeURIComponent(mint)}&post=${encodeURIComponent(p.id)}">Report post</a>`}</div></article>`;
  }

  function renderPosts() {
    const box = $("#community-posts");
    if (box)
      box.innerHTML = posts.length
        ? posts.map(postMarkup).join("")
        : empty(
            "A good hello goes a long way.",
            "No posts yet. Share the first thought, welcome your people, or tell everyone what comes next.",
          );
    const more = $("#community-more-posts");
    if (more) more.hidden = nextCursor === null;
  }

  async function loadPosts(more = false) {
    const box = $("#community-posts");
    if (!box || (more && (feedLoading || nextCursor === null))) return;
    const version = epoch,
      sequence = ++feedSequence;
    feedLoading = true;
    box.setAttribute("aria-busy", "true");
    try {
      const result = await ctx.request(
        endpoint() +
          "/posts" +
          (more ? "?before=" + encodeURIComponent(nextCursor!) : ""),
      );
      if (!same(version) || sequence !== feedSequence) return;
      const all: Post[] = more ? [...posts, ...result.posts] : result.posts;
      posts = all.filter(
        (post, index) =>
          all.findIndex((other) => other.id === post.id) === index,
      );
      nextCursor = result.nextCursor;
      renderPosts();
    } catch (err) {
      if (!same(version) || sequence !== feedSequence) return;
      if (posts.length)
        ctx.toast(
          err instanceof Error
            ? err.message
            : "The conversation could not be refreshed.",
        );
      else
        box.innerHTML = empty(
          "The conversation hit a small pause.",
          err instanceof Error ? err.message : "Posts could not be loaded.",
          '<button class="btn" data-community-refresh-posts>Try again ↻</button>',
        );
    } finally {
      if (sequence === feedSequence) {
        feedLoading = false;
        box.setAttribute("aria-busy", "false");
      }
    }
  }

  function openEditor(edit = false) {
    editorSequence++;
    editing = edit;
    preview = null;
    message("");
    $("#community-editor-title")!.textContent = edit
      ? "Make it your corner."
      : "Bring your people.";
    $("#community-editor-label")!.textContent = edit
      ? "[ YOUR SPACE CAN EVOLVE ]"
      : "[ SAME TOKEN. NEW HOME. ]";
    const box = $("#community-editor-content")!;
    revokeProfilePreviews();
    profileBusy = 0;
    if (edit && me()?.xVerified && detail?.permissions.canEdit)
      renderProfileForm(detail.community);
    else {
      const saved = readImport();
      const savedInput =
        saved && (!saved.wallet || saved.wallet === me()?.wallet)
          ? saved.input
          : "";
      box.innerHTML = `<p>Drop a pump.fun or Dexscreener link. We’ll bring over the token’s name, logo, banner, and public links where available. Review it, then make it yours.</p><form id="community-lookup-form"><label for="community-mint">Token link or Solana mint address</label><input id="community-mint" name="mint" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2048" required value="${escape(savedInput)}" placeholder="pump.fun/coin/… or dexscreener.com/solana/…"><p class="field-help">Use a token-authority wallet or a wallet that holds this token. Importing is free and does not move tokens.</p><div class="btn-row"><button class="btn btn-primary" type="submit">${!me() ? "Connect wallet & continue ↗" : !me().xVerified ? "Pair X & import details ↗" : "Find my token ↗"}</button></div><p class="field-help">Your wallet + X identify you as the organizer. You always review the profile before it goes live.</p></form>`;
    }
    if (!editor.open) editor.showModal();
  }

  function renderProfileForm(values: any) {
    revokeProfilePreviews();
    profileImages = {
      logo: {
        url: safeMediaUrl(values.logoUrl),
        id: values.logoAssetId || null,
      },
      banner: {
        url: safeMediaUrl(values.bannerUrl),
        id: values.bannerAssetId || null,
      },
    };
    const token = editing
      ? {
          name: values.tokenName,
          symbol: values.tokenSymbol,
          mint: values.mint,
        }
      : preview.token;
    const authority = editing
      ? values.importRole === "token-authority"
      : preview.eligibility.role === "token-authority";
    const field = (name: string, label: string, placeholder: string) =>
      `<label for="community-${name}">${label}</label><input id="community-${name}" name="${name}" type="url" maxlength="2048" value="${escape(safeUrl(values[name]))}" placeholder="${placeholder}">`;
    $("#community-editor-content")!.innerHTML =
      `<div class="community-editor-token">${logo(values.logoUrl || "", token.name)}<div><strong>${escape(token.name)}</strong><span>$${escape(token.symbol)} · Solana</span><code>${escape(token.mint)}</code></div></div><p class="community-review-note">${authority ? (editing ? "Your wallet was verified as a token authority when this community was imported. This is not proof that you are the original creator." : "An on-chain token authority is associated with your wallet. This is not proof that you are the original creator.") : "You are opening a community-led space. It will be clearly labeled as community-led, not as the token’s official team."}</p>${!editing && preview.warnings?.length ? `<p class="field-help">${preview.warnings.map((warning: string) => escape(warning)).join(" ")}</p>` : ""}<form id="community-profile-form"><label for="community-name">Community name</label><input id="community-name" name="name" maxlength="80" required value="${escape(values.name || token.name)}" placeholder="What do your people call this place?"><label for="community-description">What brings you together?</label><textarea id="community-description" name="description" maxlength="1000" rows="4" placeholder="The story, the people, and what happens here.">${escape(values.description || "")}</textarea><p class="field-help">These are your community’s details. Editing them does not change the token’s on-chain name or metadata.</p><fieldset class="community-color-choices"><legend>Pick your corner’s color</legend>${Object.keys(
        colors,
      )
        .map(
          (accent) =>
            `<label><input type="radio" name="accent" value="${accent}" ${(values.accent || "purple") === accent ? "checked" : ""}><span class="${tone(accent)}"><span class="sr-only">${accent}</span></span></label>`,
        )
        .join(
          "",
        )}</fieldset><div class="community-profile-art"><div><span class="community-field-label">Logo</span><div id="community-logo-preview">${profileArt("logo")}</div><label class="community-upload-button" for="community-logo-file">Upload logo ↗<input class="sr-only" id="community-logo-file" data-community-art="logo" type="file" accept="image/jpeg,image/png,image/webp"></label><button class="community-text-button" type="button" data-community-clear-art="logo">Remove logo</button></div><div><span class="community-field-label">Banner</span><div id="community-banner-preview">${profileArt("banner")}</div><label class="community-upload-button" for="community-banner-file">Upload banner ↗<input class="sr-only" id="community-banner-file" data-community-art="banner" type="file" accept="image/jpeg,image/png,image/webp"></label><button class="community-text-button" type="button" data-community-clear-art="banner">Remove banner</button></div></div><p class="field-help">Pick images from your device. JPG, PNG, or WebP, up to 20 MB. We resize them for you.</p><details class="community-editor-links" open><summary>Community links</summary><p class="field-help">Available token links are filled in automatically. Review or update them before publishing.</p>${field("websiteUrl", "Website", "https://your-community.com")}${field("xUrl", "X profile", "https://x.com/yourcommunity")}${field("telegramUrl", "Telegram", "https://t.me/yourcommunity")}</details>${!editing ? '<label class="community-check"><input type="checkbox" name="reviewed" required><span>I’ve reviewed this profile and its links, and I’m not presenting a community-led space as an official token team.</span></label>' : ""}<div class="btn-row"><button class="btn btn-primary" type="submit">${editing ? "Save community ↗" : "Open our corner ↗"}</button>${!editing ? '<button class="btn" type="button" data-community-start-over>Different token</button>' : ""}</div><p class="field-help">${editing ? "Your community profile can be updated again later." : "Free to import. Free text + image posts. No token transaction is created."}</p></form>`;
  }

  function profileArt(kind: "logo" | "banner") {
    const value = profileImages[kind];
    return `<div class="community-art-preview community-art-${kind}">${value.url ? `<img src="${escape(value.url)}" alt="${kind === "logo" ? "Community logo preview" : "Community banner preview"}" referrerpolicy="no-referrer">` : `<span>${kind === "logo" ? "✳" : "YOUR SPACE. YOUR LOOK."}</span>`}</div>`;
  }
  function renderPostImage(alt = "") {
    const slot = $("#community-post-image-slot");
    if (!slot) return;
    slot.innerHTML = postImage
      ? `<div class="community-image-draft"><img src="${escape(postImage.url)}" alt="Selected post image"><button class="community-image-remove" type="button" data-community-remove-image aria-label="Remove selected image">×</button><label for="community-image-alt">Describe this image <span>(optional, helps people using screen readers)</span></label><input id="community-image-alt" name="imageAlt" maxlength="240" value="${escape(alt)}" placeholder="What’s in the picture?"></div>`
      : "";
  }
  async function lookupToken(
    input: string,
    version = epoch,
    editorVersion = editorSequence,
  ) {
    rememberImport(input, me()?.wallet);
    const result = await ctx.request("/communities/preview", {
      mint: input.trim(),
    });
    if (!same(version) || editorVersion !== editorSequence) return;
    preview = result;
    if (result.existingCommunity) {
      clearImport();
      $("#community-editor-content")!.innerHTML = empty(
        "Your people are already here.",
        "This token already has a community on Nikki. Open its space to join the conversation.",
        `<a class="btn btn-primary" href="${communityLink(result.existingCommunity)}">Visit the community ↗</a>`,
      );
      return;
    }
    if (!result.eligibility.canImport)
      throw Error(
        "Use a wallet with an on-chain token authority or a wallet that already holds this token to import it.",
      );
    clearImport();
    renderProfileForm(result.token);
    $("#community-name")?.focus();
  }

  root.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement;
    if (
      ![
        "community-lookup-form",
        "community-profile-form",
        "community-post-form",
      ].includes(form.id)
    )
      return;
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    const version = epoch,
      editorVersion = editorSequence,
      editingAtSubmit = editing,
      importedMint = preview?.token?.mint;
    void action(
      button,
      async () => {
        const data = new FormData(form);
        if (form.id === "community-lookup-form") {
          const input = String(data.get("mint") || "").trim();
          rememberImport(input, me()?.wallet);
          if (!me()) {
            importRequested = true;
            editor.close();
            ctx.connect();
            return;
          }
          if (!me().xVerified) {
            location.assign("/api/creators/auth/x/start");
            return;
          }
          await lookupToken(input, version, editorVersion);
        } else if (form.id === "community-profile-form") {
          if (!me()?.xVerified)
            throw Error("Pair your wallet and X to continue.");
          if (profileBusy)
            throw Error("Your image is still uploading. Give it a moment.");
          if (!editingAtSubmit && (!importedMint || !data.get("reviewed")))
            throw Error("Review the profile before opening your community.");
          const values: Record<string, string | null> = {};
          for (const name of [
            "name",
            "description",
            "websiteUrl",
            "xUrl",
            "telegramUrl",
            "accent",
          ])
            values[name] = String(data.get(name) || "").trim();
          values.logoUrl = profileImages.logo.id ? "" : profileImages.logo.url;
          values.bannerUrl = profileImages.banner.id
            ? ""
            : profileImages.banner.url;
          values.logoAssetId = profileImages.logo.id;
          values.bannerAssetId = profileImages.banner.id;
          for (const name of ["websiteUrl", "xUrl", "telegramUrl"])
            if (values[name] && !safeUrl(values[name]))
              throw Error(
                "Use a public HTTPS address for your community links.",
              );
          const result = await ctx.request(
            editingAtSubmit ? endpoint() + "/profile" : "/communities",
            editingAtSubmit ? values : { ...values, mint: importedMint },
          );
          if (!same(version) || editorVersion !== editorSequence) return;
          if (!editingAtSubmit) {
            location.assign(communityLink(result.community.mint));
            return;
          }
          if (detail) detail.community = result.community;
          const draft =
            $<HTMLTextAreaElement>("#community-post-text")?.value || "";
          const draftAlt =
            $<HTMLInputElement>("#community-image-alt")?.value || "";
          editor.close();
          renderDetail();
          renderPostImage(draftAlt);
          const textarea = $<HTMLTextAreaElement>("#community-post-text");
          if (textarea) {
            textarea.value = draft;
            updateCounter();
          }
          renderPosts();
          $("#community-posts")?.setAttribute("aria-busy", "false");
          ctx.toast("Your corner, updated.");
        } else {
          if (!detail?.permissions.canPost)
            throw Error("Posting is unavailable for this account.");
          if (postBusy) return;
          const text = String(data.get("text") || "").trim();
          const imageAlt = String(data.get("imageAlt") || "").trim();
          if (!text && !postImage)
            throw Error("Add a thought or an image before posting.");
          const selected = postImage;
          lockPost(true);
          let result: any;
          try {
            if (selected && !selected.uploaded)
              selected.uploaded = await uploadImage(
                selected.blob,
                "post-image",
              );
            if (!same(version)) return;
            const imageId = selected?.uploaded?.id;
            if (
              !pendingPost ||
              pendingPost.text !== text ||
              pendingPost.imageId !== imageId ||
              (pendingPost.imageAlt || "") !== imageAlt
            )
              pendingPost = {
                text,
                clientId: crypto.randomUUID(),
                ...(imageId ? { imageId, imageAlt } : {}),
              };
            result = await ctx.request(endpoint() + "/posts", pendingPost);
            if (!same(version)) return;
          } finally {
            if (same(version)) lockPost(false);
          }
          // A response begun before this mutation must not replace the new feed.
          feedSequence++;
          feedLoading = false;
          $("#community-posts")?.setAttribute("aria-busy", "false");
          const alreadyListed = posts.some(
            (post) => post.id === result.post.id,
          );
          posts = [
            result.post,
            ...posts.filter((post) => post.id !== result.post.id),
          ];
          pendingPost = null;
          clearPostImage();
          renderPostImage();
          // Fields were locked while posting, so the successful draft can reset.
          const textarea = $<HTMLTextAreaElement>("#community-post-text");
          if (textarea?.value.trim() === text) form.reset();
          updateCounter();
          renderPosts();
          if (detail && !alreadyListed) {
            detail.community.postCount++;
            updateCounts();
          }
          ctx.toast("Posted. Your people can see it now.");
        }
      },
      form.id !== "community-post-form",
      editorVersion,
    );
  });

  function updateCounter() {
    const textarea = $<HTMLTextAreaElement>("#community-post-text"),
      counter = $("#community-post-counter");
    if (textarea && counter)
      counter.textContent = textarea.value.length.toLocaleString() + " / 2,000";
  }
  function updateCounts() {
    if (!detail) return;
    const members = $("[data-community-member-count]"),
      total = $("[data-community-post-count]");
    if (members) members.textContent = count(detail.community.memberCount);
    if (total) total.textContent = count(detail.community.postCount);
    const memberLabel = $("[data-community-member-label]"),
      postLabel = $("[data-community-post-label]");
    if (memberLabel)
      memberLabel.textContent =
        detail.community.memberCount === 1 ? "member" : "members";
    if (postLabel)
      postLabel.textContent =
        detail.community.postCount === 1 ? "post" : "posts";
  }

  root.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.id === "community-post-text") updateCounter();
    if (input.id === "communities-search") {
      query = input.value.trim();
      clearTimeout(searchTimer);
      // Invalidate the previous query immediately, including during the debounce.
      directorySequence++;
      searchTimer = setTimeout(() => void loadDirectory(), 250);
    }
  });

  root.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (input.id === "community-post-image") {
      if (postBusy) return;
      const version = epoch,
        sequence = ++postImageSequence;
      lockPost(true);
      void (async () => {
        try {
          const blob = await prepareImage(file, { kind: "post-image" });
          if (!same(version) || sequence !== postImageSequence) return;
          clearPostImage();
          postImage = { blob, url: URL.createObjectURL(blob) };
          pendingPost = null;
          renderPostImage();
        } catch (err) {
          if (same(version))
            ctx.toast(
              err instanceof Error
                ? err.message
                : "That image could not be prepared.",
            );
        } finally {
          if (same(version)) lockPost(false);
          input.value = "";
        }
      })();
    }
    const kind = input.dataset.communityArt;
    if (kind === "logo" || kind === "banner") {
      const version = epoch,
        editorVersion = editorSequence,
        sequence = ++profileImageSequences[kind];
      profileBusy++;
      input.disabled = true;
      const submit = $<HTMLButtonElement>(
        '#community-profile-form button[type="submit"]',
      );
      if (submit) submit.disabled = true;
      message("Making your " + kind + " look good…");
      void (async () => {
        let objectUrl = "";
        const current = () =>
          same(version) &&
          editorVersion === editorSequence &&
          sequence === profileImageSequences[kind];
        try {
          const blob = await prepareImage(file, {
            kind: kind === "logo" ? "community-logo" : "community-banner",
          });
          if (!current()) return;
          objectUrl = URL.createObjectURL(blob);
          profileObjectUrls.add(objectUrl);
          const target = $("#community-" + kind + "-preview");
          if (target)
            target.innerHTML = `<div class="community-art-preview community-art-${kind}"><img src="${escape(objectUrl)}" alt="New ${kind} preview"></div>`;
          const uploaded = await uploadImage(
            blob,
            kind === "logo" ? "community-logo" : "community-banner",
          );
          if (!current()) return;
          profileImages[kind] = { url: uploaded.url, id: uploaded.id };
          if (target) target.innerHTML = profileArt(kind);
          message("Image ready. Save the profile to make it live.");
        } catch (err) {
          if (current()) {
            message(
              err instanceof Error
                ? err.message
                : "Your image could not be uploaded.",
            );
            const target = $("#community-" + kind + "-preview");
            if (target) target.innerHTML = profileArt(kind);
          }
        } finally {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            profileObjectUrls.delete(objectUrl);
          }
          if (same(version) && editorVersion === editorSequence) {
            profileBusy = Math.max(0, profileBusy - 1);
            input.disabled = false;
            if (submit) submit.disabled = profileBusy > 0;
          }
          input.value = "";
        }
      })();
    }
  });

  root.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (
        image instanceof HTMLImageElement &&
        image.hasAttribute("data-community-image")
      ) {
        // Public IPFS gateways can be temporarily unavailable. Retry the same
        // content address once before showing the community's initials.
        if (!image.dataset.communityRetried) {
          try {
            const url = new URL(image.src);
            if (
              ["ipfs.io", "cloudflare-ipfs.com"].includes(url.hostname) &&
              /^\/ipfs\/[a-zA-Z0-9]+(?:\/|$)/.test(url.pathname)
            ) {
              image.dataset.communityRetried = "1";
              image.src = "https://gateway.pinata.cloud" + url.pathname;
              return;
            }
          } catch {
            /* Fall through to the local monogram. */
          }
        }
        image.replaceWith(
          document.createTextNode(image.dataset.fallback || "↗"),
        );
      }
    },
    true,
  );

  editor.addEventListener("close", () => {
    editorSequence++;
    revokeProfilePreviews();
  });

  root.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLElement>("button,a");
    if (!target || !root.contains(target)) return;
    if (
      target.hasAttribute("data-community-import") ||
      target.hasAttribute("data-community-start-over")
    )
      openEditor();
    if (target.hasAttribute("data-community-edit")) {
      if (postBusy) ctx.toast("Your post is on its way. Give it a moment.");
      else openEditor(true);
    }
    if (target.hasAttribute("data-community-compose")) {
      $("#community-composer-slot")?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
      $("#community-post-text")?.focus({ preventScroll: true });
    }
    if (target.hasAttribute("data-community-remove-image") && !postBusy) {
      clearPostImage();
      pendingPost = null;
      renderPostImage();
    }
    const clearArt = target.dataset.communityClearArt;
    if ((clearArt === "logo" || clearArt === "banner") && !profileBusy) {
      profileImageSequences[clearArt]++;
      profileImages[clearArt] = { url: "", id: null };
      const slot = $("#community-" + clearArt + "-preview");
      if (slot) slot.innerHTML = profileArt(clearArt);
    }
    if (target.hasAttribute("data-community-connect")) {
      editor.close();
      ctx.connect();
    }
    if (target.hasAttribute("data-community-clear-search")) {
      query = "";
      $<HTMLInputElement>("#communities-search")!.value = "";
      void loadDirectory();
    }
    if (target.hasAttribute("data-community-retry-directory"))
      void loadDirectory();
    if (target.id === "communities-more")
      void action(target as HTMLButtonElement, () => loadDirectory(true));
    if (target.hasAttribute("data-community-retry-detail")) void loadDetail();
    if (target.hasAttribute("data-community-refresh-posts"))
      void action(target as HTMLButtonElement, () => loadPosts());
    if (target.id === "community-more-posts")
      void action(target as HTMLButtonElement, () => loadPosts(true));
    if (target.hasAttribute("data-community-copy-mint"))
      void action(target as HTMLButtonElement, async () => {
        await navigator.clipboard.writeText(mint);
        ctx.toast("Token address copied.");
      });
    if (target.hasAttribute("data-community-join")) {
      if (!me()) {
        ctx.connect();
        return;
      }
      if (!detail?.permissions.canJoin) {
        ctx.toast("Community membership is unavailable for this account.");
        return;
      }
      const version = epoch;
      void action(target as HTMLButtonElement, async () => {
        const result = await ctx.request(endpoint() + "/membership", {
          joined: !detail!.joined,
        });
        if (!same(version) || !detail) return;
        detail.joined = result.joined;
        detail.community.memberCount = result.memberCount;
        target.textContent = result.joined
          ? "✓ Joined · Leave"
          : "Join the community ↗";
        target.setAttribute("aria-pressed", String(result.joined));
        updateCounts();
        ctx.toast(
          result.joined
            ? "You’re in. Make yourself at home."
            : "You’ve left this community.",
        );
      });
    }
    if (target.hasAttribute("data-community-remove")) {
      const id = target.dataset.communityRemove!;
      const post = posts.find((row) => String(row.id) === id);
      if (!post || (!post.canDelete && !post.canModerate)) return;
      target.parentElement!.innerHTML = `<span class="field-help">Remove this post? </span><button class="community-text-button" data-community-confirm-remove="${escape(id)}">Yes, remove</button><button class="community-text-button" data-community-cancel-remove>Cancel</button>`;
    }
    if (target.hasAttribute("data-community-cancel-remove")) renderPosts();
    if (target.hasAttribute("data-community-confirm-remove")) {
      const id = target.dataset.communityConfirmRemove!,
        version = epoch;
      void action(target as HTMLButtonElement, async () => {
        await ctx.request(
          endpoint() + "/posts/" + encodeURIComponent(id) + "/delete",
          {},
        );
        if (!same(version)) return;
        feedSequence++;
        feedLoading = false;
        $("#community-posts")?.setAttribute("aria-busy", "false");
        posts = posts.filter((post) => String(post.id) !== id);
        if (detail)
          detail.community.postCount = Math.max(
            0,
            detail.community.postCount - 1,
          );
        renderPosts();
        updateCounts();
        ctx.toast("Post removed.");
      });
    }
  });

  return {
    async accountChanged() {
      const user = me(),
        next = `${user?.wallet || ""}|${user?.xVerified || false}|${user?.xUsername || ""}`;
      if (identity === next) return;
      const first = identity === undefined;
      identity = next;
      epoch++;
      directorySequence++;
      feedSequence++;
      preview = null;
      pendingPost = null;
      clearPostImage();
      postBusy = false;
      revokeProfilePreviews();
      detail = null;
      posts = [];
      nextCursor = null;
      directoryLoading = false;
      feedLoading = false;
      if (!first) {
        editor.close();
        $("#community-editor-content")!.replaceChildren();
        const box = $("#community-detail");
        if (box)
          box.innerHTML = empty(
            "Opening this corner…",
            "Refreshing your community access.",
          );
      }
      const refreshVersion = epoch,
        refreshEditorVersion = editorSequence;
      if (directoryView) await loadDirectory();
      else await loadDetail();
      if (!same(refreshVersion) || refreshEditorVersion !== editorSequence)
        return;
      const saved = readImport();
      if (saved?.wallet && user?.wallet && saved.wallet !== user.wallet)
        clearImport();
      if (
        importRequested ||
        (saved && saved.wallet === user?.wallet && user?.xVerified)
      ) {
        importRequested = false;
        openEditor();
        if (
          saved &&
          (!saved.wallet || saved.wallet === user?.wallet) &&
          user?.xVerified
        ) {
          const button = $<HTMLButtonElement>(
            '#community-lookup-form button[type="submit"]',
          );
          void action(button, () => lookupToken(saved.input), true);
        }
      }
    },
  };
}
