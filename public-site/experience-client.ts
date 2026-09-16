type Context = {
  request: (path: string, data?: unknown) => Promise<any>;
  getMe: () => any;
  getConfig: () => any;
  refreshMe: () => Promise<void>;
  toast: (message: string) => void;
  connect: () => void;
};
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s);
const e = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const date = (n: number) =>
  new Date(n * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
const empty = (title: string, copy: string) =>
  `<div class="empty-state compact-empty"><h3>${title}</h3><p>${copy}</p></div>`;
const image = (id: string | null, kind: string) =>
  id
    ? `<img src="/api/creators/media/${e(id)}" alt="Current ${kind}" width="${kind === "avatar" ? 400 : 1200}" height="400">`
    : `<span>${kind === "avatar" ? "YOU" : "YOUR SPACE"}</span>`;
export function startExperience(ctx: Context) {
  let identity: string | undefined,
    epoch = 0,
    activityOffset: number | null = 0,
    activityRows: any[] = [],
    libraryItems: any[] = [],
    opsPaused = false;
  const same = (version: number) => version === epoch;
  async function safeTask(fn: () => Promise<void>, button?: HTMLButtonElement) {
    if (button?.disabled) return;
    const version = epoch;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      await fn();
    } catch (err) {
      if (same(version))
        ctx.toast(err instanceof Error ? err.message : "Please try again.");
    } finally {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    }
  }
  function requireWallet() {
    if (!ctx.getMe().user) {
      ctx.connect();
      return false;
    }
    return true;
  }
  function selectTab(value: string) {
    const tab = ["channel", "token", "activity"].includes(value)
      ? value
      : "channel";
    document.documentElement.dataset.studioTab = tab;
    document
      .querySelectorAll<HTMLElement>("[data-studio-tab]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.studioTab === tab)),
      );
    if (tab === "activity") void safeTask(() => activity());
  }
  function receipt(row: any, admin = false) {
    return `<article class="receipt"><div><span class="badge status-${e(row.status)}">${e(row.status)}</span><h3>${row.kind === "launch" ? "Creator token launch" : "Creator fee collection"}</h3><p class="field-help">${e(date(row.created_at))}${admin ? "<br>Wallet " + e(row.wallet) : ""}</p>${row.mint ? `<p class="mono break-word">Mint ${e(row.mint)}</p>` : ""}</div><div class="btn-row">${row.signature ? `<a class="btn btn-small" href="https://solscan.io/tx/${e(row.signature)}" target="_blank" rel="noreferrer">View receipt ↗</a>` : '<span class="field-help">No submitted signature</span>'}${["prepared", "submitted"].includes(row.status) ? `<button class="btn btn-small" data-${admin ? "ops-reconcile" : "history-check"}="${e(row.id)}">Check status ↻</button>` : ""}</div></article>`;
  }
  async function activity(more = false) {
    const box = $("#activity-list");
    if (!box) return;
    if (!ctx.getMe().user) {
      box.innerHTML = empty(
        "Your wallet’s paper trail.",
        "Connect your wallet to see launches and fee collections.",
      );
      return;
    }
    const version = epoch,
      result = await ctx.request(
        "/transactions?offset=" + (more ? activityOffset || 0 : 0),
      );
    if (!same(version)) return;
    activityRows = more
      ? [...activityRows, ...result.transactions]
      : result.transactions;
    activityOffset = result.nextOffset;
    box.innerHTML = activityRows.length
      ? activityRows.map((r) => receipt(r)).join("") +
        (activityOffset !== null
          ? '<button class="btn" data-more-activity>Load more activity ↓</button>'
          : "")
      : empty(
          "A clean slate.",
          "Your first token launch or fee collection will appear here.",
        );
  }
  async function support() {
    const box = $("#support-list");
    if (!box) return;
    if (!ctx.getMe().user) {
      box.innerHTML =
        '<button class="btn" data-connect>Connect to view requests ↗</button>';
      return;
    }
    const version = epoch,
      result = await ctx.request("/support");
    if (!same(version)) return;
    box.innerHTML = result.tickets.length
      ? result.tickets
          .map(
            (t: any) =>
              `<article class="ticket"><span class="badge">${e(t.status)}</span><h3>${e(t.category)}</h3><p class="field-help">${e(date(t.created_at))} · ${e(t.id.slice(0, 8))}</p><p class="description">${e(t.message)}</p>${t.reply ? `<div class="ticket-reply"><strong>Nikki replied</strong><p class="description">${e(t.reply)}</p></div>` : '<p class="field-help">Waiting for a reply. Check back here for updates.</p>'}</article>`,
          )
          .join("")
      : empty(
          "All clear.",
          "Requests you send will appear here, along with replies from Nikki.",
        );
  }
  async function library() {
    const box = $("#library-results"),
      video = $<HTMLVideoElement>("video[data-record-id]");
    if (!box && !video) return;
    if (!ctx.getMe().user) {
      if (box)
        box.innerHTML =
          empty(
            "Keep a place for the good stuff.",
            "Connect your wallet to save videos and continue across devices.",
          ) +
          '<button class="btn btn-primary" data-connect>Connect wallet ↗</button>';
      return;
    }
    const version = epoch,
      result = await ctx.request("/library");
    if (!same(version)) return;
    libraryItems = result.items;
    if (video) {
      const item = libraryItems.find(
          (i) => i.record_id === video.dataset.recordId,
        ),
        save = $<HTMLButtonElement>("[data-save-record]"),
        resume = $<HTMLButtonElement>("#resume-video");
      if (save) {
        save.textContent = item?.saved
          ? "♥ Saved to library"
          : "♡ Save for later";
        save.setAttribute("aria-pressed", String(!!item?.saved));
      }
      if (resume) {
        resume.hidden = !(item?.position > 5);
        resume.dataset.position = String(item?.position || 0);
        resume.textContent =
          "Continue from " +
          Math.floor((item?.position || 0) / 60) +
          ":" +
          String(Math.floor((item?.position || 0) % 60)).padStart(2, "0");
      }
    }
    if (!box) return;
    const archive = await fetch("/archive.json").then((r) => {
      if (!r.ok) throw Error("The archive could not be loaded.");
      return r.json();
    });
    if (!same(version)) return;
    const items = libraryItems
      .map((i) => ({
        ...i,
        record: archive.records.find((r: any) => r.arweaveTx === i.record_id),
      }))
      .filter((i) => i.record && (i.saved || i.position > 5));
    box.innerHTML = items.length
      ? `<div class="library-grid">${items.map((i) => `<article class="library-card"><a class="library-play" href="/watch/${e(i.record_id)}/" aria-label="Watch ${e(i.record.title)}">▶</a><div><span class="eyebrow accent">${i.saved ? "SAVED FOR LATER" : "CONTINUE WATCHING"}</span><h2><a href="/watch/${e(i.record_id)}/">${e(i.record.title)}</a></h2><p>${e(i.record.category)}${i.position > 5 ? " · " + Math.floor(i.position / 60) + " min watched" : ""}</p><div class="btn-row"><a class="btn btn-primary" href="/watch/${e(i.record_id)}/">${i.position > 5 ? "Continue" : "Watch"} ↗</a><button class="btn" data-forget-record="${e(i.record_id)}">Remove from library</button></div></div></article>`).join("")}</div>`
      : empty(
          "Room for something lasting.",
          "Save a preserved video to find it here. The founder’s first video is coming soon.",
        ) + '<a class="btn" href="/#archive">Explore the archive ↗</a>';
  }
  async function ops() {
    const box = $("#ops-results");
    if (!box) return;
    if (!ctx.getMe().user?.isFounder) {
      box.innerHTML = empty(
        "Founder access only.",
        "Connect the configured founder wallet to manage support and service operations.",
      );
      return;
    }
    const version = epoch,
      r = await ctx.request("/ops/overview");
    if (!same(version)) return;
    opsPaused = r.paused;
    box.innerHTML = `<div class="ops-counts">${[
      ["Published channels", r.counts.channels],
      ["Verified creator tokens", r.counts.tokens],
      ["Open requests", r.counts.openTickets],
      ["Pending over 10 min", r.counts.pendingTransactions],
    ]
      .map(
        ([label, n]) =>
          `<div class="card"><strong>${e(n)}</strong><span>${e(label)}</span></div>`,
      )
      .join(
        "",
      )}</div><section class="card section-space"><div class="section-heading"><h2>Service controls</h2><span class="badge">${r.paused ? "TRANSACTIONS PAUSED" : "TRANSACTIONS OPEN"}</span></div><p>Pause new token transactions during an incident. Existing transaction status checks and video playback stay available.</p><div class="btn-row"><button class="btn" data-ops-toggle>${r.paused ? "Resume transactions" : "Pause new transactions"}</button><button class="btn" data-ops-health>Check connections ↻</button></div><p id="ops-health" role="status"></p><p class="field-help">Channel artwork: ${(Number(r.counts.imageBytes) / 1048576).toFixed(2)} / 64 MB application limit. ${r.imageStorageEnabled ? "Image storage connected." : "Image storage setup pending."}</p><div class="btn-row"><a class="text-link" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Cloudflare usage ↗</a><a class="text-link" href="https://dashboard.helius.dev/" target="_blank" rel="noreferrer">RPC usage ↗</a></div><p class="field-help">Provider dashboards show billable usage. These counts do not estimate charges.</p></section><section class="section-space"><h2>Support queue</h2>${r.tickets.length ? r.tickets.map((t: any) => `<form class="ticket" data-ops-ticket="${e(t.id)}"><span class="badge">${e(t.status)}</span><h3>${e(t.category)}${t.target_handle ? " · @" + e(t.target_handle) : ""}</h3><p class="field-help">${e(date(t.created_at))} · ${e(t.wallet)}</p><p class="description">${e(t.message)}</p><label>Reply to this wallet<textarea name="reply" required maxlength="1500" rows="3">${e(t.reply)}</textarea></label><label>Status<select name="status">${["open", "reviewing", "resolved"].map((v) => `<option ${v === t.status ? "selected" : ""}>${v}</option>`).join("")}</select></label><button class="btn" type="submit">Save reply</button></form>`).join("") : empty("No requests waiting.", "New support requests will appear here.")}</section><section class="section-space"><h2>Recent transactions</h2>${r.transactions.map((t: any) => receipt(t, true)).join("") || empty("No transactions yet.", "Launch and fee collection records will appear here.")}</section><details class="section-space"><summary>Recent founder actions</summary>${r.audit.map((a: any) => `<p>${e(date(a.created_at))} · ${e(a.action)} · <span class="mono">${e(a.target.slice(0, 12))}</span></p>`).join("") || "<p>No operations recorded yet.</p>"}</details>`;
  }
  async function resize(file: File, kind: string) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    )
      throw Error("Choose a JPEG, PNG, or WebP image under 12 MB.");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 40000000)
        throw Error("Choose a smaller image (up to 40 megapixels).");
      const canvas = document.createElement("canvas");
      canvas.width = kind === "avatar" ? 400 : 1200;
      canvas.height = 400;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Your browser could not prepare this image.");
      const scale = Math.max(
          canvas.width / bitmap.width,
          canvas.height / bitmap.height,
        ),
        w = canvas.width / scale,
        h = canvas.height / scale;
      context.drawImage(
        bitmap,
        (bitmap.width - w) / 2,
        (bitmap.height - h) / 2,
        w,
        h,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      for (const quality of [0.86, 0.7, 0.5, 0.3]) {
        const blob = await new Promise<Blob | null>((r) =>
          canvas.toBlob(r, "image/jpeg", quality),
        );
        if (blob && blob.size <= (kind === "avatar" ? 131072 : 393216))
          return blob;
      }
      throw Error(
        "This image is too detailed to upload. Choose a smaller photo.",
      );
    } finally {
      bitmap.close();
    }
  }
  async function accountChanged() {
    const me = ctx.getMe();
    if (identity !== me.user?.wallet) {
      identity = me.user?.wallet;
      epoch++;
      activityRows = [];
      activityOffset = 0;
      libraryItems = [];
      savedAt = 0;
      const save = $<HTMLButtonElement>("[data-save-record]"),
        resume = $<HTMLButtonElement>("#resume-video"),
        note = $("#playback-note");
      if (save) {
        save.textContent = "♡ Save for later";
        save.setAttribute("aria-pressed", "false");
      }
      if (resume) {
        resume.hidden = true;
        resume.dataset.position = "0";
      }
      if (note) note.textContent = "";
      document
        .querySelectorAll<HTMLElement>("[data-private]")
        .forEach((n) => (n.innerHTML = ""));
      $<HTMLFormElement>("#support-form")?.reset();
    }
    document
      .querySelectorAll<HTMLElement>("[data-founder-only]")
      .forEach((n) => (n.hidden = !me.user?.isFounder));
    for (const kind of ["avatar", "banner"]) {
      const img = $("#art-" + kind),
        input = $<HTMLInputElement>(`[data-art-upload="${kind}"]`),
        remove = $<HTMLButtonElement>(`[data-art-remove="${kind}"]`),
        id = me.profile?.[kind + "_id"];
      if (img) img.innerHTML = image(id, kind);
      if (input)
        input.disabled =
          !me.profile || !me.user?.xVerified || !ctx.getConfig().imagesEnabled;
      if (remove) remove.hidden = !id;
    }
    const note = $("#artwork-note");
    if (note)
      note.textContent = !me.profile
        ? "Save your channel to add a photo and cover."
        : !me.user?.xVerified
          ? "Verify X to add your channel photo and cover."
          : !ctx.getConfig().imagesEnabled
            ? "Photo uploads are being connected. Your channel color and profile are ready to use."
            : "A square profile photo and a wide cover. Make this space feel like you.";
    const link = $<HTMLAnchorElement>("#my-channel-link");
    if (link) {
      link.hidden = !me.profile?.published;
      link.href = "/c/" + encodeURIComponent(me.profile?.handle || "") + "/";
    }
    await Promise.all([
      support(),
      library(),
      ops(),
      document.documentElement.dataset.studioTab === "activity"
        ? activity()
        : Promise.resolve(),
    ]);
  }
  document.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLElement>("button,a");
    if (!b) return;
    if (b.dataset.studioTab) {
      selectTab(b.dataset.studioTab);
      history.replaceState(null, "", "#" + b.dataset.studioTab);
    }
    if (b.hasAttribute("data-refresh-activity"))
      void safeTask(() => activity(), b as HTMLButtonElement);
    if (b.hasAttribute("data-more-activity"))
      void safeTask(() => activity(true), b as HTMLButtonElement);
    if (b.hasAttribute("data-refresh-support"))
      void safeTask(support, b as HTMLButtonElement);
    if (b.hasAttribute("data-refresh-library"))
      void safeTask(library, b as HTMLButtonElement);
    if (b.hasAttribute("data-refresh-ops"))
      void safeTask(ops, b as HTMLButtonElement);
    if (b.dataset.historyCheck || b.dataset.opsReconcile)
      void safeTask(async () => {
        const version = epoch;
        const r = await ctx.request(
          b.dataset.opsReconcile ? "/ops/reconcile" : "/transaction/status",
          { id: b.dataset.opsReconcile || b.dataset.historyCheck },
        );
        if (!same(version)) return;
        ctx.toast("Transaction status: " + r.status);
        await ctx.refreshMe();
        await (b.dataset.opsReconcile ? ops() : activity());
      }, b as HTMLButtonElement);
    if (b.hasAttribute("data-ops-toggle"))
      void safeTask(async () => {
        await ctx.request("/ops/flags", { paused: !opsPaused });
        await ops();
      }, b as HTMLButtonElement);
    if (b.hasAttribute("data-ops-health"))
      void safeTask(async () => {
        const version = epoch;
        const r = await ctx.request("/ops/health", {});
        if (same(version) && $("#ops-health"))
          $("#ops-health")!.textContent =
            `Database connected · Solana mainnet connected · X ${r.xConfigured ? "configured" : "not configured"} · Images ${r.imagesConfigured ? "configured" : "not configured"} · ${date(r.checkedAt)}`;
      }, b as HTMLButtonElement);
    if (b.dataset.artRemove)
      void safeTask(async () => {
        await ctx.request("/profile/media/" + b.dataset.artRemove, {
          remove: true,
        });
        await ctx.refreshMe();
        ctx.toast("Channel artwork removed.");
      }, b as HTMLButtonElement);
    if (b.dataset.saveRecord || b.dataset.forgetRecord)
      void safeTask(async () => {
        if (!requireWallet()) return;
        const version = epoch,
          id = b.dataset.saveRecord || b.dataset.forgetRecord;
        const item = libraryItems.find((i) => i.record_id === id);
        await ctx.request("/library", {
          recordId: id,
          saved: b.dataset.forgetRecord ? false : !item?.saved,
          ...(b.dataset.forgetRecord ? { position: 0 } : {}),
        });
        if (!same(version)) return;
        await library();
        ctx.toast(
          b.dataset.forgetRecord
            ? "Removed from your library."
            : item?.saved
              ? "Removed from saved videos."
              : "Saved. A good one to come back to. ♥",
        );
      }, b as HTMLButtonElement);
    if (b.id === "resume-video")
      void safeTask(async () => {
        const video = $<HTMLVideoElement>("video[data-record-id]");
        if (video) {
          if (!Number.isFinite(video.duration)) {
            await new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                clearTimeout(timer);
                video.removeEventListener("loadedmetadata", ready);
                video.removeEventListener("error", failed);
              };
              const ready = () => {
                cleanup();
                resolve();
              };
              const failed = () => {
                cleanup();
                reject(Error("The video could not load. Try again shortly."));
              };
              const timer = setTimeout(failed, 12000);
              video.addEventListener("loadedmetadata", ready, { once: true });
              video.addEventListener("error", failed, { once: true });
            });
          }
          video.currentTime = Math.min(
            Number(b.dataset.position || 0),
            Math.max(0, video.duration - 2),
          );
          await video.play();
          b.hidden = true;
        }
      }, b as HTMLButtonElement);
    const url = b.dataset.shareUrl || b.dataset.copy;
    if (url) {
      if (b.dataset.shareUrl && navigator.share) {
        void navigator.share({ title: document.title, url }).catch((err) => {
          if (err.name !== "AbortError")
            ctx.toast("Sharing is unavailable. Use Copy link.");
        });
      } else
        void safeTask(async () => {
          try {
            await navigator.clipboard.writeText(url);
            ctx.toast(b.dataset.copySuccess || "Link copied. Pass it on. ↗");
          } catch {
            const box = $<HTMLDialogElement>("#copy-dialog");
            if (box) {
              $<HTMLInputElement>("#copy-value")!.value = url;
              box.showModal();
              $<HTMLInputElement>("#copy-value")!.select();
            }
          }
        });
    }
  });
  document.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement;
    if (form.id !== "support-form" && !form.dataset.opsTicket) return;
    event.preventDefault();
    void safeTask(async () => {
      if (!requireWallet() || !form.reportValidity()) return;
      const version = epoch,
        data = new FormData(form);
      if (form.dataset.opsTicket) {
        await ctx.request("/ops/ticket", {
          id: form.dataset.opsTicket,
          reply: data.get("reply"),
          status: data.get("status"),
        });
        if (!same(version)) return;
        await ops();
        ctx.toast("Reply saved.");
      } else {
        await ctx.request("/support", {
          category: data.get("category"),
          handle: data.get("handle"),
          message: data.get("message"),
        });
        if (!same(version)) return;
        form.reset();
        $("#support-feedback")!.textContent =
          "Request sent. Your reply will appear below.";
        await support();
        ctx.toast("You’re in the queue. We’ll reply here.");
      }
    }, form.querySelector<HTMLButtonElement>('button[type="submit"]')!);
  });
  document.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.artUpload || !input.files?.[0]) return;
    const file = input.files[0],
      kind = input.dataset.artUpload;
    void safeTask(async () => {
      const version = epoch;
      input.disabled = true;
      ctx.toast("Getting your image ready…");
      try {
        const blob = await resize(file, kind);
        if (!same(version)) return;
        const response = await fetch("/api/creators/profile/media/" + kind, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        const r = await response.json();
        if (!same(version)) return;
        if (!response.ok)
          throw Error(r.error || "Your image could not be uploaded.");
        await ctx.refreshMe();
        ctx.toast("Looking more like you. Image saved.");
      } finally {
        input.value = "";
        input.disabled =
          !ctx.getMe().profile ||
          !ctx.getMe().user?.xVerified ||
          !ctx.getConfig().imagesEnabled;
      }
    });
  });
  const video = $<HTMLVideoElement>("video[data-record-id]");
  let savedAt = 0,
    progressQueue = Promise.resolve();
  if (video) {
    const saveProgress = (force = false) => {
      if (
        !ctx.getMe().user ||
        (!video.ended && video.currentTime < 1) ||
        (!force && Date.now() - savedAt < 30000)
      )
        return;
      savedAt = Date.now();
      const version = epoch;
      const recordId = video.dataset.recordId,
        position = video.ended ? 0 : video.currentTime;
      progressQueue = progressQueue
        .catch(() => {})
        .then(async () => {
          if (!same(version)) return;
          await ctx.request("/library", { recordId, position });
        })
        .then(() => {
          if (same(version) && $("#playback-note"))
            $("#playback-note")!.textContent =
              "Progress saved to your wallet’s library.";
        })
        .catch(() => {
          if (same(version) && $("#playback-note"))
            $("#playback-note")!.textContent =
              "Progress could not be saved. Check your connection.";
        });
    };
    video.addEventListener("timeupdate", () => saveProgress());
    video.addEventListener("pause", () =>
      saveProgress(Date.now() - savedAt > 5000),
    );
    video.addEventListener("ended", () => saveProgress(true));
  }
  if ($("#channel-form")) selectTab(location.hash.slice(1));
  const params = new URLSearchParams(location.search);
  if ($("#support-handle"))
    $<HTMLInputElement>("#support-handle")!.value = (
      params.get("channel") || ""
    ).slice(0, 24);
  if (params.get("topic") === "video" && $("#support-category"))
    $<HTMLSelectElement>("#support-category")!.value = "Video report";
  if (params.get("topic") === "community" && $("#support-category")) {
    $<HTMLSelectElement>("#support-category")!.value = "Community report";
    const mint = params.get("community") || "",
      post = params.get("post") || "";
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) && $("#support-message")) {
      $<HTMLTextAreaElement>("#support-message")!.value =
        "Community: " +
        location.origin +
        "/communities/" +
        mint +
        "/" +
        (/^[1-9][0-9]{0,15}$/.test(post) ? "\nPost: " + post : "") +
        "\n\nWhat happened: ";
    }
  }
  return { accountChanged };
}
