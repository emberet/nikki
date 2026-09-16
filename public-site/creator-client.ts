import { startChannelPosts } from "./channel-posts-client";
import { startCommunities } from "./communities-client";
import { startExperience } from "./experience-client";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
type Wallet = PhantomWalletAdapter | SolflareWalletAdapter;
type Channel = {
  wallet: string;
  handle: string;
  display_name: string;
  bio: string;
  category: string;
  accent: string;
  x_username: string;
  x_id: string;
  mint: string | null;
  token_name: string | null;
  token_symbol: string | null;
  avatar_id?: string | null;
  banner_id?: string | null;
};
type Me = {
  user: {
    wallet: string;
    xVerified: boolean;
    xUsername: string | null;
    isFounder?: boolean;
  } | null;
  profile: any;
  token: any;
  intent: any;
};
type Prepared = {
  id: string;
  transaction: string;
  estimatedLamports: string;
  kind: "launch" | "claim";
  mint: string;
  signature?: string;
  resuming?: boolean;
};
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);
const e = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const short = (value: string) => value.slice(0, 4) + "…" + value.slice(-4);
const sol = (value: string) => {
  const n = BigInt(value);
  return (
    (n / 1000000000n).toString() +
    "." +
    (n % 1000000000n)
      .toString()
      .padStart(9, "0")
      .replace(/0+$/, "")
      .padEnd(2, "0")
  );
};
let adapter: Wallet | null = null,
  me: Me = { user: null, profile: null, token: null, intent: null },
  config: any = {},
  prepared: Prepared | null = null,
  mintKey: Keypair | null = null;
let directoryRequest = 0,
  directoryOffset: number | null = 0,
  directoryChannels: Channel[] = [],
  identityEpoch = 0;
const initialTokenPanel = $("#token-panel")?.innerHTML || "";
let toastTimer: ReturnType<typeof setTimeout>;
async function request(path: string, data?: unknown) {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("/api/creators" + path, {
      method: data === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
    let value: any;
    try {
      value = await r.json();
    } catch {
      if (controller.signal.aborted) throw new Error("Request timed out.");
      throw Error("Creator accounts are not available in this preview yet.");
    }
    if (!r.ok)
      throw Error(value.error || "This action could not be completed.");
    return value;
  } catch (error) {
    if (controller.signal.aborted)
      throw Error(
        "This request took too long. Check its status, then try again.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toast(message: string) {
  const box = $("#creator-toast");
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), 7000);
}
function feedback(selector: string, message: string, error = false) {
  const box = $(selector);
  if (box) {
    box.textContent = message;
    box.classList.toggle("text-error", error);
  }
}
async function action(button: HTMLButtonElement, fn: () => Promise<void>) {
  if (button.disabled) return;
  const label = button.textContent;
  const epoch = identityEpoch;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    await fn();
  } catch (err) {
    if (epoch === identityEpoch)
      toast(err instanceof Error ? err.message : "Please try again.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (label && button.textContent === "Working…") button.textContent = label;
  }
}
let meRequest = 0;
async function refreshMe() {
  const sequence = ++meRequest;
  const next = await request("/me");
  if (sequence !== meRequest) return;
  if (me.user?.wallet !== next.user?.wallet) {
    identityEpoch++;
    const subscriptionsBox = $("#subscriptions-results");
    if (subscriptionsBox) subscriptionsBox.innerHTML = "";
    prepared = null;
    mintKey = null;
    $<HTMLFormElement>("#channel-form")?.reset();
    const handle = $<HTMLInputElement>("#channel-handle");
    if (handle) handle.readOnly = false;
    const panel = $("#token-panel");
    if (panel) panel.innerHTML = initialTokenPanel;
    const balance = $("#creator-fee-balance");
    if (balance) balance.textContent = "—";
    feedback(
      "#fee-note",
      "Launch your token to see actual fees. Rates vary; earnings are not guaranteed.",
    );
    feedback("#channel-message", "");
    feedback("#transaction-message", "");
    $<HTMLDialogElement>("#transaction-dialog")?.close();
  }
  me = next;
  for (const button of document.querySelectorAll<HTMLElement>(
    "[data-connect]",
  )) {
    if (button.closest("#studio-access")) continue;
    button.textContent = me.user
      ? short(me.user.wallet) + " ↗"
      : "Connect wallet ↗";
  }
  if ($("#channel-form")) renderStudio();
  await Promise.all([
    experience.accountChanged(),
    communities.accountChanged(),
    channelPosts.accountChanged(),
  ]);
}
function walletDialog() {
  const dialog = $<HTMLDialogElement>("#wallet-dialog");
  if (!dialog) return;
  feedback(
    "#wallet-message",
    me.user
      ? "Signed in as " +
          short(me.user.wallet) +
          ". Connect the matching wallet for transactions."
      : "",
  );
  dialog.showModal();
}
async function connect(choice: string) {
  const message = $("#wallet-message")!;
  message.textContent = "Opening your wallet…";
  adapter =
    choice === "solflare"
      ? new SolflareWalletAdapter()
      : new PhantomWalletAdapter();
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile && adapter.readyState !== "Installed") {
    const page = encodeURIComponent(location.origin + "/creator-studio/"),
      ref = encodeURIComponent(location.origin);
    const url =
      choice === "solflare"
        ? `https://solflare.com/ul/v1/browse/${page}?ref=${ref}`
        : `https://phantom.app/ul/browse/${page}?ref=${ref}`;
    message.innerHTML = `<a class="btn btn-primary" href="${e(url)}">Open Nikki in ${e(adapter.name)} ↗</a><p>Continue inside your wallet’s browser, then connect again.</p>`;
    return;
  }
  if (adapter.readyState !== "Installed" && adapter.readyState !== "Loadable") {
    message.innerHTML = `Install <a class="text-link" href="${e(adapter.url)}" target="_blank" rel="noreferrer">${e(adapter.name)} ↗</a>, then return here. On mobile, open Nikki in your wallet’s browser.`;
    return;
  }
  try {
    await adapter.connect();
    if (!adapter.publicKey) throw Error("Wallet connection was not completed.");
    const address = adapter.publicKey.toBase58();
    message.textContent =
      "Sign the message in your wallet. This does not send funds.";
    const challenge = await request("/auth/challenge", { wallet: address });
    const signature = await adapter.signMessage(
      new TextEncoder().encode(challenge.message),
    );
    await request("/auth/verify", {
      id: challenge.id,
      signature: bs58.encode(signature),
    });
    $<HTMLDialogElement>("#wallet-dialog")!.close();
    await refreshMe();
    toast("Wallet connected. Make yourself at home.");
    if ($("#subscriptions-results")) await subscriptions();
  } catch (err) {
    message.textContent =
      err instanceof Error ? err.message : "Wallet sign-in was cancelled.";
  }
}
function tone(value: string) {
  return ["purple", "lime", "pink", "blue"].includes(value) ? value : "purple";
}
function channelCard(channel: Channel) {
  return `<article class="creator-card tone-${tone(channel.accent)}"><a class="channel-cover" href="/c/${e(channel.handle)}/" aria-label="Open ${e(channel.display_name)}">${channel.banner_id ? `<img loading="lazy" src="/api/creators/media/${e(channel.banner_id)}" alt="" width="1200" height="400">` : ""}<span class="cover-symbol">${channel.category === "History" ? "∞" : channel.category === "Culture" ? "✳" : "↗"}</span><span class="cover-caption">${e(channel.category)}</span></a><div class="channel-card-body"><a class="channel-avatar" href="/c/${e(channel.handle)}/" aria-hidden="true" tabindex="-1">${channel.avatar_id ? `<img loading="lazy" src="/api/creators/media/${e(channel.avatar_id)}" alt="" width="400" height="400">` : e(channel.display_name.slice(0, 2).toUpperCase())}</a><a href="/c/${e(channel.handle)}/"><h2>${e(channel.display_name)}</h2></a><a class="x-link" href="https://x.com/i/user/${e(channel.x_id)}" target="_blank" rel="noreferrer">𝕏 @${e(channel.x_username)} <span class="verified-mark" title="Wallet paired with this X account">✓</span></a><p>${e(channel.bio || "A new channel, with a story to tell.")}</p><div class="channel-card-bottom"><span class="holder-tag">${channel.mint ? "♡ $" + e(channel.token_symbol) : "TOKEN NOT LAUNCHED"}</span><a href="/c/${e(channel.handle)}/" class="card-arrow" aria-label="Open channel">↗</a></div></div></article>`;
}
async function directory(more = false) {
  if (!$("#creator-directory-results")) return;
  const sequence = ++directoryRequest;
  const query = $<HTMLInputElement>("#creator-search")?.value || "";
  const selected =
    $("[data-creator-category][aria-pressed='true']")?.dataset
      .creatorCategory || "";
  try {
    const result = await request(
      "/channels?q=" +
        encodeURIComponent(query) +
        "&category=" +
        encodeURIComponent(selected) +
        "&offset=" +
        (more ? directoryOffset || 0 : 0),
    );
    if (sequence !== directoryRequest) return;
    directoryChannels = more
      ? [...directoryChannels, ...result.channels]
      : result.channels;
    directoryOffset = result.nextOffset;
    if (directoryChannels.length)
      $("#creator-directory-results")!.innerHTML =
        `<p class="directory-count">${directoryChannels.length} ${directoryChannels.length === 1 ? "creator" : "creators"} found</p><div class="creator-card-grid">${directoryChannels.map(channelCard).join("")}</div>${directoryOffset !== null ? '<button class="btn directory-more" id="more-creators">More people to meet ↓</button>' : ""}`;
    else if (query || selected)
      $("#creator-directory-results")!.innerHTML =
        '<div class="empty-state"><h2>No matching creators yet.</h2><p>Try another name or category.</p></div>';
    else
      $("#creator-directory-results")!.innerHTML =
        `<div class="channel-invitation"><div class="identity-shapes" aria-hidden="true"><span>↗</span><span>♡</span><span>∞</span></div><span class="eyebrow accent">MAKE SOMETHING WORTH KEEPING</span><h2>Your corner of the internet.<br>With a longer memory.</h2><p>Be here from the beginning. Publish your wallet-and-X channel, then bring your people.</p><a class="btn btn-primary" href="/creator-studio/">Start your channel ↗</a></div>`;
    return result.channels as Channel[];
  } catch (err) {
    if (sequence !== directoryRequest) return;
    $("#creator-directory-results")!.innerHTML =
      `<div class="empty-state"><h2>Couldn’t load creators.</h2><p>${e(err instanceof Error ? err.message : "Please try again.")}</p><button class="btn" id="retry-creators">Try again ↻</button></div>`;
  }
}
function preview() {
  const form = $<HTMLFormElement>("#channel-form");
  if (!form) return;
  const data = new FormData(form),
    name = String(data.get("displayName") || "Your channel"),
    accent = tone(String(data.get("accent")));
  $("#channel-preview")!.className = "creator-card tone-" + accent;
  $("#preview-name")!.textContent = name;
  $("#preview-handle")!.textContent =
    "@" + String(data.get("handle") || "your_name");
  $("#preview-bio")!.textContent = String(
    data.get("bio") ||
      "A little context goes a long way. Tell your future subscribers what you make.",
  );
  $("#channel-preview .channel-avatar")!.innerHTML = me.profile?.avatar_id
    ? `<img src="/api/creators/media/${e(me.profile.avatar_id)}" alt="" width="400" height="400">`
    : e(name.slice(0, 2).toUpperCase());
  const cover = $("#channel-preview .channel-cover");
  if (cover) {
    cover.querySelector("img")?.remove();
    if (me.profile?.banner_id)
      cover.insertAdjacentHTML(
        "afterbegin",
        `<img src="/api/creators/media/${e(me.profile.banner_id)}" alt="" width="1200" height="400">`,
      );
  }
}
function renderStudio() {
  const access = $("#studio-access")!;
  access.innerHTML = me.user
    ? `<span class="paired-wallet">✓ Wallet paired <strong class="mono">${e(short(me.user.wallet))}</strong></span><button class="btn btn-small" id="disconnect-creator">Sign out</button>`
    : `<button class="btn btn-primary" data-connect>Connect your wallet ↗</button><span>Sign in to save your channel. Signing in does not send funds.</span>`;
  for (const field of document.querySelectorAll<
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLButtonElement
  >(
    "#channel-form input,#channel-form textarea,#channel-form select,#channel-form button",
  ))
    field.disabled = !me.user;
  if (me.profile) {
    const form = $<HTMLFormElement>("#channel-form")!;
    for (const [name, value] of Object.entries({
      displayName: me.profile.display_name,
      handle: me.profile.handle,
      bio: me.profile.bio,
    })) {
      const input = form.elements.namedItem(name) as HTMLInputElement;
      if (input) input.value = String(value);
    }
    const radio = $<HTMLInputElement>(
      `input[name="accent"][value="${tone(me.profile.accent)}"]`,
    );
    if (radio) radio.checked = true;
    $<HTMLInputElement>("#channel-handle")!.readOnly = true;
  }
  $("#channel-save-state")!.textContent = me.profile?.published
    ? "PUBLISHED"
    : me.profile
      ? "DRAFT SAVED"
      : "NOT SAVED";
  $("#save-channel")!.textContent = me.profile?.published
    ? "Save changes"
    : "Save draft";
  $<HTMLButtonElement>("#publish-channel")!.hidden = !!me.profile?.published;
  const x = $<HTMLAnchorElement>("#link-x")!;
  x.hidden = !me.user;
  x.textContent = me.user?.xVerified ? "Refresh X ↻" : "Verify X ↗";
  $("#x-identity")!.textContent = me.user?.xVerified
    ? "@" + me.user.xUsername + " · Paired"
    : "Pair your X account";
  $("#x-identity-help")!.textContent = me.user?.xVerified
    ? "This X account is linked to your signed wallet."
    : config.xEnabled
      ? "Show people the person behind the wallet."
      : "X verification is being connected. You can save a private draft now.";
  for (const [id, done] of Object.entries({
    wallet: !!me.user,
    x: !!me.user?.xVerified,
    channel: !!me.profile?.published,
    token: me.token?.status === "verified",
  }))
    $("#step-" + id)?.classList.toggle("complete", done);
  preview();
  renderToken();
}
async function saveChannel(publish: boolean) {
  const form = $<HTMLFormElement>("#channel-form")!;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const epoch = identityEpoch;
  try {
    const result = await request("/profile", {
      handle: data.get("handle"),
      displayName: data.get("displayName"),
      bio: data.get("bio"),
      category: me.profile?.category || "Knowledge",
      accent: data.get("accent"),
      published: publish || !!me.profile?.published,
    });
    if (epoch !== identityEpoch) return;
    await refreshMe();
    feedback(
      "#channel-message",
      result.published
        ? "You’re live. Your channel is ready to share."
        : "Draft saved. Pair your X account when you’re ready to publish.",
    );
    toast(
      result.published
        ? "Your channel is live. Hello, internet. ↗"
        : "Draft saved.",
    );
  } catch (err) {
    if (epoch !== identityEpoch) return;
    feedback(
      "#channel-message",
      err instanceof Error ? err.message : "Could not save.",
      true,
    );
  }
}
function renderToken() {
  const panel = $("#token-panel");
  if (!panel) return;
  if (me.token) {
    const token = me.token,
      live = token.status === "verified";
    panel.innerHTML = `<div class="token-summary"><span class="token-symbol-chip tone-${tone(token.accent)}">$${e(token.symbol)}</span><div><span class="badge ${live ? "published" : ""}">${live ? "LIVE ON SOLANA" : "LAUNCH DRAFT"}</span><h3>${e(token.name)}</h3><p>${e(token.description)}</p></div></div><dl class="record-details"><dt>TOKEN MINT</dt><dd class="mono">${e(token.mint)}</dd></dl>${live ? `<div class="btn-row"><a class="btn btn-primary" href="https://pump.fun/coin/${e(token.mint)}" target="_blank" rel="noreferrer">Open on pump.fun ↗</a><a class="btn" href="/c/${e(me.profile?.handle)}/">Open my channel ↗</a></div>` : `<div class="btn-row"><button id="resume-launch" class="btn btn-primary">${mintKey ? "Review launch cost ↗" : "Check launch status ↻"}</button><button id="discard-launch" class="btn">Discard unlaunched draft</button></div><p class="field-help">${mintKey ? "Your mint key is held only in this browser tab until launch." : "This draft was started in another page session. Check whether it reached Solana. An unlaunched draft can be discarded after all transactions expire."}</p>`}`;
  } else {
    if (!panel.querySelector("#token-form"))
      panel.innerHTML = initialTokenPanel;
    for (const input of panel.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    >("input,textarea,button"))
      input.disabled = !me.user?.xVerified || !me.profile?.published;
  }
  const live = me.token?.status === "verified";
  for (const id of ["#refresh-fees", "#claim-fees"]) {
    const button = $<HTMLButtonElement>(id);
    if (button) button.disabled = !live;
  }
  if (live)
    feedback(
      "#fee-note",
      "Refresh to read your actual unclaimed creator fees.",
    );
}
async function createToken(form: HTMLFormElement) {
  if (!form.reportValidity()) return;
  if (!me.user?.xVerified || !me.profile?.published)
    throw Error("Publish your wallet-and-X channel first.");
  const data = new FormData(form);
  const creatorWallet = me.user.wallet;
  const key = Keypair.generate();
  await request("/token/draft", {
    mint: key.publicKey.toBase58(),
    name: data.get("name"),
    symbol: data.get("symbol"),
    description: data.get("description"),
  });
  if (me.user?.wallet !== creatorWallet)
    throw Error(
      "The wallet changed. Reconnect the original creator wallet to recover its saved draft.",
    );
  mintKey = key;
  await refreshMe();
  toast("Token draft saved. Review the cost before you launch.");
  await reviewTransaction("launch");
}
async function reviewTransaction(kind: "launch" | "claim") {
  if (
    !adapter?.connected ||
    adapter.publicKey?.toBase58() !== me.user?.wallet
  ) {
    walletDialog();
    throw Error(
      "Connect your channel’s wallet, then review the transaction again.",
    );
  }
  if (kind === "launch" && !mintKey)
    throw Error(
      "The mint key exists only in the tab that created this draft. Check the launch status before discarding an unlaunched draft.",
    );
  const epoch = identityEpoch;
  const dialog = $<HTMLDialogElement>("#transaction-dialog")!;
  $("#transaction-title")!.textContent =
    kind === "launch"
      ? "One token. Your channel."
      : "Collect your creator fees.";
  $("#transaction-details")!.innerHTML =
    "<p>Simulating the transaction and checking its cost…</p>";
  feedback("#transaction-message", "");
  $<HTMLButtonElement>("#sign-transaction")!.disabled = true;
  $<HTMLButtonElement>("#sign-transaction")!.hidden = false;
  $<HTMLButtonElement>("#check-transaction")!.hidden = true;
  dialog.showModal();
  try {
    const result = await request("/transaction/prepare", { kind });
    if (epoch !== identityEpoch) return;
    prepared = result;
    $("#transaction-details")!.innerHTML =
      `<div class="transaction-cost"><span>Estimated network + account cost</span><strong>${e(sol(prepared!.estimatedLamports))} SOL</strong></div><dl class="record-details"><dt>YOUR WALLET</dt><dd class="mono">${e(me.user!.wallet)}</dd><dt>${kind === "launch" ? "CREATOR TOKEN" : "FEES"}</dt><dd>${kind === "launch" ? "$" + e(me.token.symbol) + " · " + e(me.token.name) : "Native SOL creator fees and available PumpSwap fees"}</dd></dl><p>${kind === "launch" ? "This creates a token through pump.fun with your wallet as creator and fee recipient. It does not include an initial purchase. Metadata is hosted by Nikki." : "Collected funds go to your connected creator wallet. This total can include fees from other tokens launched by this wallet."}</p><p class="field-help">${kind === "launch" ? "Token creation is an on-chain action. Token value and trading activity are not guaranteed. Holding the token does not grant rights to your content or revenue." : "The displayed amount can change before confirmation. Your wallet will show the transaction before you approve."}</p>`;
    if (prepared!.signature) {
      $<HTMLButtonElement>("#sign-transaction")!.hidden = true;
      $<HTMLButtonElement>("#check-transaction")!.hidden = false;
      feedback(
        "#transaction-message",
        "A transaction is already submitted. Check its status before taking another action.",
      );
    } else $<HTMLButtonElement>("#sign-transaction")!.disabled = false;
  } catch (err) {
    if (epoch !== identityEpoch) return;
    feedback(
      "#transaction-message",
      err instanceof Error
        ? err.message
        : "Could not prepare this transaction.",
      true,
    );
  }
}
async function signTransaction() {
  if (
    !prepared ||
    !me.user ||
    !adapter?.connected ||
    adapter.publicKey?.toBase58() !== me.user?.wallet
  )
    throw Error("Connect the channel’s wallet again.");
  const epoch = identityEpoch,
    intentId = prepared.id;
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(prepared.transaction, "base64"),
  );
  if (transaction.message.staticAccountKeys[0].toBase58() !== me.user.wallet)
    throw Error("The transaction payer does not match your wallet.");
  if (prepared.kind === "launch") {
    if (!mintKey || mintKey.publicKey.toBase58() !== prepared.mint)
      throw Error("The launch key does not match this draft.");
    transaction.sign([mintKey]);
  }
  feedback("#transaction-message", "Review and sign in your wallet…");
  try {
    const signed = await adapter.signTransaction(transaction);
    if (epoch !== identityEpoch) return;
    feedback(
      "#transaction-message",
      "Submitting the exact signed transaction…",
    );
    $<HTMLButtonElement>("#sign-transaction")!.hidden = true;
    $<HTMLButtonElement>("#check-transaction")!.hidden = false;
    await request("/transaction/submit", {
      id: intentId,
      transaction: Buffer.from(signed.serialize()).toString("base64"),
    });
    if (epoch !== identityEpoch) return;
    await checkTransaction();
  } catch (err) {
    if (epoch !== identityEpoch) return;
    feedback(
      "#transaction-message",
      err instanceof Error ? err.message : "The transaction was not completed.",
      true,
    );
    $<HTMLButtonElement>("#check-transaction")!.hidden = false;
  }
}
async function checkTransaction() {
  const id = prepared?.id || me.intent?.id;
  if (!id) throw Error("There is no submitted transaction yet.");
  const epoch = identityEpoch;
  const result = await request("/transaction/status", { id });
  if (epoch !== identityEpoch) return;
  if (result.status === "confirmed") {
    feedback("#transaction-message", "Confirmed on Solana. You’re all set.");
    toast(
      me.token?.status === "draft"
        ? "Your creator token is live. Welcome, holders. ♡"
        : "Creator fees collected.",
    );
    mintKey = null;
    await refreshMe();
  } else if (result.status === "failed" || result.status === "expired") {
    feedback(
      "#transaction-message",
      result.status === "failed"
        ? "The transaction failed. No successful launch was recorded. Request a new estimate."
        : "The transaction expired without confirmation. You can request a new estimate.",
      true,
    );
    await refreshMe();
  } else {
    feedback(
      "#transaction-message",
      "Waiting for final confirmation on Solana. You can return and check this same transaction again.",
    );
    toast(
      result.status === "prepared"
        ? "No submitted transaction is recorded yet."
        : "Still confirming. Your launch is saved.",
    );
  }
}
async function fees() {
  const epoch = identityEpoch;
  const result = await request("/fees");
  if (epoch !== identityEpoch) return;
  $("#creator-fee-balance")!.textContent = sol(result.unclaimedLamports);
  feedback(
    "#fee-note",
    `${result.creatorFeeBps !== null ? "Current bonding-curve creator fee: " + (Number(result.creatorFeeBps) / 100).toFixed(2) + "%. " : "Token graduated; pool fee rates can vary. "}Updated ${new Date(result.checkedAt * 1000).toLocaleTimeString()}.`,
  );
}
async function subscriptions() {
  if (!me.user) {
    walletDialog();
    return;
  }
  const box = $("#subscriptions-results");
  if (!box) return;
  const epoch = identityEpoch;
  box.innerHTML =
    '<p class="notice" role="status">Checking your token balances on Solana…</p>';
  try {
    const result = await request("/subscriptions");
    const archive = result.channels.length
      ? await fetch("/archive.json").then((r) => {
          if (!r.ok) throw Error("The archive could not be loaded.");
          return r.json();
        })
      : { records: [] };
    if (epoch !== identityEpoch) return;
    const creators = new Map<string, Channel>(
      result.channels.map((c: Channel) => [c.wallet, c]),
    );
    const records = archive.records.filter((r: any) => creators.has(r.creator));
    box.innerHTML = result.channels.length
      ? `<p class="field-help">Verified from your current wallet holdings. Updated ${e(new Date(result.checkedAt * 1000).toLocaleTimeString())}.</p><div class="creator-card-grid">${result.channels.map(channelCard).join("")}</div><section class="section-space"><h2>From your creators<span class="accent">.</span></h2>${records.length ? `<div class="grid">${records.map((r: any) => `<a class="card video-card" href="/watch/${e(r.arweaveTx)}/"><div class="thumb"><span class="thumb-play">▶</span></div><div class="meta"><span class="badge published">Preserved</span><h3>${e(r.title)}</h3><p>${e(creators.get(r.creator)?.display_name)}</p></div></a>`).join("")}</div>` : '<div class="empty-state"><h3>Their next record will appear here.</h3><p>Your creators have no preserved videos yet. Every published record stays free to watch.</p></div>'}</section>`
      : '<div class="channel-invitation"><div class="identity-shapes" aria-hidden="true"><span>♡</span><span>↗</span></div><h2>Your next favorite is out there.</h2><p>No published Nikki creator tokens were found in this wallet. Explore channels and discover work you want to support.</p><a class="btn btn-primary" href="/creators/">Find creators ↗</a></div>';
  } catch (err) {
    if (epoch !== identityEpoch) return;
    box.innerHTML = `<div class="error" role="alert">${e(err instanceof Error ? err.message : "Holdings could not be checked.")}</div>`;
  }
}
async function publicChannel() {
  const box = $("#public-channel");
  if (!box) return;
  const handle = location.pathname.split("/").filter(Boolean)[1];
  if (!handle) {
    box.innerHTML =
      '<div class="empty-state"><h1>Choose a creator to visit.</h1><a class="btn" href="/creators/">Discover creators →</a></div>';
    return;
  }
  try {
    const { channel } = await request(
      "/channels/" + encodeURIComponent(handle),
    );
    let records: any[] = [];
    const archive = await fetch("/archive.json").then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    });
    records = archive.records.filter((r: any) => r.creator === channel.wallet);
    document.title = channel.display_name + " — Nikki";
    box.innerHTML = `<a class="eyebrow text-link" href="/creators/">← All creators</a><header class="public-channel-header tone-${tone(channel.accent)}"><div class="public-channel-cover ${channel.banner_id ? "has-image" : ""}">${channel.banner_id ? `<img src="/api/creators/media/${e(channel.banner_id)}" alt="" width="1200" height="400">` : ""}<span>${e(channel.category)} / PERMANENT RECORDS</span><strong>MAKE IT<br>WORTH KEEPING.</strong><span class="cover-symbol">↗</span></div><div class="public-channel-identity"><div class="channel-avatar">${channel.avatar_id ? `<img src="/api/creators/media/${e(channel.avatar_id)}" alt="" width="400" height="400">` : e(channel.display_name.slice(0, 2).toUpperCase())}</div><div><h1>${e(channel.display_name)}</h1><a class="x-link" href="https://x.com/i/user/${e(channel.x_id)}" target="_blank" rel="noreferrer">𝕏 @${e(channel.x_username)} ✓</a><span class="mono muted">${e(short(channel.wallet))}</span></div><div class="channel-subscribe">${channel.mint ? `<button class="btn btn-primary" id="check-membership" data-handle="${e(handle)}">♡ Check holder status</button><a class="text-link" href="https://pump.fun/coin/${e(channel.mint)}" target="_blank" rel="noreferrer">View $${e(channel.token_symbol)} on pump.fun ↗</a>` : '<span class="badge">CREATOR TOKEN NOT LAUNCHED</span>'}</div></div></header><div class="channel-about-row"><p>${e(channel.bio)}</p><div class="holder-tag">${records.length} PRESERVED ${records.length === 1 ? "VIDEO" : "VIDEOS"}</div></div><p id="membership-status" class="field-help" aria-live="polite">${channel.mint ? "Holding this creator’s token makes you a subscriber. Videos remain free to watch." : "This creator can launch a token when they are ready."}</p><div class="channel-actions"><button class="btn" data-share-url="https://nikki.run/c/${e(handle)}/">Share channel ↗</button><button class="btn" data-copy="https://nikki.run/c/${e(handle)}/">Copy link</button><a class="text-link" href="/help/?channel=${e(handle)}">Report or get help</a></div>${channel.mint ? `<details class="token-proof"><summary>Check the creator token</summary><p>This mint was checked against its confirmed pump.fun launch and creator wallet. X pairing confirms account control, not content accuracy or token value.</p><dl class="record-details"><dt>TOKEN MINT</dt><dd class="mono">${e(channel.mint)}</dd><dt>CREATOR & FEE RECIPIENT</dt><dd class="mono">${e(channel.wallet)}</dd></dl><div class="btn-row"><button class="btn btn-small" data-copy="${e(channel.mint)}">Copy mint</button><a class="btn btn-small" href="https://solscan.io/token/${e(channel.mint)}" target="_blank" rel="noreferrer">Check on Solana ↗</a></div></details>` : ""}<section class="section-space" data-channel-feed data-channel-handle="${e(handle)}" aria-label="Channel posts" aria-busy="true"><p>Loading posts…</p></section><section class="section-space"><div class="section-heading"><h2>The work<span class="accent">.</span></h2><span class="eyebrow muted">PRESERVED FOR EVERYONE</span></div>${records.length ? `<div class="grid">${records.map((r) => `<a class="card video-card" href="/watch/${e(r.arweaveTx)}/"><div class="thumb"><span class="thumb-play">▶</span><span class="thumb-label">${(Number(r.sizeBytes) / 1e6).toFixed(0)} MB</span></div><div class="meta"><span class="badge published">Preserved</span><h3>${e(r.title)}</h3></div></a>`).join("")}</div>` : '<div class="empty-state"><div class="empty-symbol" aria-hidden="true">[ ▶ ]</div><h3>A first record is worth waiting for.</h3><p>This creator has no preserved videos yet. Records appear only after approval and verified permanent storage.</p></div>'}</section>`;
    await channelPosts.mount();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><h1>This channel isn’t available yet.</h1><p>${e(err instanceof Error ? err.message : "")}</p><a class="btn" href="/creators/">Discover creators →</a></div>`;
  }
}
function motion() {
  let enabled = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    if (localStorage.getItem("nikki-motion") === "off") enabled = false;
  } catch {}
  document.documentElement.dataset.motion = enabled ? "on" : "off";
  const menu = $("[data-toggle-motion]");
  if (menu) menu.textContent = enabled ? "Turn motion off" : "Turn motion on";
  const button = $("#motion-toggle");
  if (button) {
    button.textContent = "Motion: " + (enabled ? "on" : "off");
    button.setAttribute("aria-pressed", String(enabled));
  }
}
document.addEventListener("click", (event) => {
  const element = (event.target as HTMLElement).closest<HTMLElement>(
    "button,a",
  );
  if (!element) return;
  if (element.matches("[data-open-menu]"))
    $<HTMLDialogElement>("#app-menu")?.showModal();
  if (element.matches("[data-toggle-motion]")) {
    document.querySelector<HTMLButtonElement>("#motion-toggle")?.click();
    element.textContent =
      document.documentElement.dataset.motion === "on"
        ? "Turn motion off"
        : "Turn motion on";
  }
  if (element.id === "more-creators")
    void action(element as HTMLButtonElement, async () => {
      await directory(true);
    });
  if (element.id === "retry-creators") void directory();
  if (element.matches("[data-connect]")) {
    event.preventDefault();
    walletDialog();
  }
  if (element.matches("[data-wallet]"))
    void action(element as HTMLButtonElement, () =>
      connect(element.dataset.wallet!),
    );
  if (element.id === "link-x" && config.xEnabled) {
    const form = $<HTMLFormElement>("#channel-form");
    if (form && me.user)
      try {
        sessionStorage.setItem(
          "nikki-channel-draft:" + me.user.wallet,
          JSON.stringify(Object.fromEntries(new FormData(form))),
        );
      } catch {}
  }
  if (element.id === "link-x" && !config.xEnabled) {
    event.preventDefault();
    toast(
      "X verification is being connected. Your private draft can still be saved.",
    );
  }
  if (element.id === "disconnect-creator")
    void action(element as HTMLButtonElement, async () => {
      await request("/auth/logout", {});
      await adapter?.disconnect();
      location.reload();
    });
  if (element.id === "publish-channel")
    void action(element as HTMLButtonElement, () => saveChannel(true));
  if (element.id === "resume-launch")
    void action(element as HTMLButtonElement, () =>
      mintKey ? reviewTransaction("launch") : checkTransaction(),
    );
  if (element.id === "discard-launch")
    void action(element as HTMLButtonElement, async () => {
      await request("/token/abandon", {});
      location.reload();
    });
  if (element.id === "refresh-fees")
    void action(element as HTMLButtonElement, fees);
  if (element.id === "claim-fees")
    void action(element as HTMLButtonElement, () => reviewTransaction("claim"));
  if (element.id === "sign-transaction")
    void action(element as HTMLButtonElement, signTransaction);
  if (element.id === "check-transaction")
    void action(element as HTMLButtonElement, checkTransaction);
  if (element.id === "refresh-subscriptions")
    void action(element as HTMLButtonElement, subscriptions);
  if (element.id === "check-membership")
    void action(element as HTMLButtonElement, async () => {
      if (!me.user) {
        walletDialog();
        return;
      }
      const epoch = identityEpoch;
      const result = await request("/membership/" + element.dataset.handle);
      if (epoch !== identityEpoch) return;
      feedback(
        "#membership-status",
        result.subscribed
          ? "✓ You’re a holder subscriber. This wallet holds the creator’s token."
          : "This wallet doesn’t currently hold the creator’s token. You can still watch every preserved video.",
      );
      element.textContent = result.subscribed
        ? "♡ Holder subscriber"
        : "↻ Check again";
    });
  if (element.id === "motion-toggle") {
    const on = document.documentElement.dataset.motion !== "on";
    document.documentElement.dataset.motion = on ? "on" : "off";
    element.textContent = "Motion: " + (on ? "on" : "off");
    element.setAttribute("aria-pressed", String(on));
    const menu = $("[data-toggle-motion]");
    if (menu) menu.textContent = on ? "Turn motion off" : "Turn motion on";
    try {
      localStorage.setItem("nikki-motion", on ? "on" : "off");
    } catch {}
  }
  if (element.matches("[data-creator-category]")) {
    for (const button of document.querySelectorAll("[data-creator-category]"))
      button.setAttribute("aria-pressed", String(button === element));
    void directory();
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  if (form.id === "channel-form") {
    event.preventDefault();
    void action($<HTMLButtonElement>("#save-channel")!, () =>
      saveChannel(false),
    );
  }
  if (form.id === "token-form") {
    event.preventDefault();
    void action(form.querySelector("button")!, () => createToken(form));
  }
});
$("#channel-form")?.addEventListener("input", preview);
let searchTimer: ReturnType<typeof setTimeout>;
$("#creator-search")?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void directory(), 250);
});
const experience = startExperience({
  request,
  getMe: () => me,
  getConfig: () => config,
  refreshMe,
  toast,
  connect: walletDialog,
});
const channelPosts = startChannelPosts({
  request,
  getMe: () => me,
  connect: walletDialog,
  toast,
});
const communities = startCommunities({
  request,
  getMe: () => me,
  connect: walletDialog,
  toast,
});
motion();
addEventListener("pageshow", (event) => {
  if (event.persisted) void refreshMe().catch(() => {});
});
function registerCreatorSearch() {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool(tool: unknown, options: { signal: AbortSignal }): unknown;
      };
    }
  ).modelContext;
  if (!context?.registerTool || !$("#creator-search")) return;
  const lifecycle = new AbortController();
  addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  try {
    void Promise.resolve(
      context.registerTool(
        {
          name: "search_creator_channels",
          title: "Search creator channels",
          description:
            "Search published creator channels and update the visible directory. Returns the first 25 matches.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", maxLength: 100 },
              category: {
                type: "string",
                enum: ["", "History", "Knowledge", "Culture"],
              },
            },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          async execute(input: unknown) {
            const data = input as { query?: unknown; category?: unknown };
            if (
              !data ||
              typeof data.query !== "string" ||
              data.query.length > 100 ||
              ![undefined, "", "History", "Knowledge", "Culture"].includes(
                data.category as string | undefined,
              )
            )
              throw Error(
                "Choose a query up to 100 characters and a listed category.",
              );
            $<HTMLInputElement>("#creator-search")!.value = data.query;
            for (const button of document.querySelectorAll<HTMLElement>(
              "[data-creator-category]",
            ))
              button.setAttribute(
                "aria-pressed",
                String(
                  button.dataset.creatorCategory === (data.category || ""),
                ),
              );
            const channels = await directory();
            if (!channels)
              throw Error("The creator directory could not be loaded.");
            return {
              channels: channels.map((c) => ({
                handle: c.handle,
                name: c.display_name,
                url: "/c/" + c.handle + "/",
                tokenSymbol: c.token_symbol,
              })),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {}
}
registerCreatorSearch();
void (async () => {
  try {
    config = await request("/config");
    await refreshMe();
    await Promise.all([
      directory(),
      publicChannel(),
      $("#subscriptions-results") && me.user
        ? subscriptions()
        : Promise.resolve(),
    ]);
    const x = new URLSearchParams(location.search).get("x");
    if (x && me.user && $("#channel-form"))
      try {
        const key = "nikki-channel-draft:" + me.user.wallet,
          saved = sessionStorage.getItem(key);
        if (saved) {
          const draft = JSON.parse(saved),
            form = $<HTMLFormElement>("#channel-form")!;
          for (const name of ["displayName", "bio"]) {
            const field = form.elements.namedItem(name) as HTMLInputElement;
            if (field && typeof draft[name] === "string")
              field.value = draft[name];
          }
          if (!me.profile && typeof draft.handle === "string")
            $<HTMLInputElement>("#channel-handle")!.value = draft.handle;
          sessionStorage.removeItem(key);
          preview();
        }
      } catch {}
    if (x === "connected")
      toast("X paired. Your channel has a face behind the wallet. ✓");
    if (x === "cancelled")
      toast("X verification was cancelled. Your draft is still here.");
  } catch (err) {
    if ($("#channel-form")) renderStudio();
    await communities.accountChanged();
    toast(
      err instanceof Error
        ? err.message
        : "Creator accounts are temporarily unavailable.",
    );
  }
})();
