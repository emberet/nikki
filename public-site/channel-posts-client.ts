import { prepareImage, uploadImage } from "./image-upload";

type Context = {
  request: (path: string, data?: unknown) => Promise<any>;
  getMe: () => any;
  connect: () => void;
  toast: (message: string) => void;
};
type FeedPost = {
  id: string;
  text: string;
  createdAt: number;
  author: {
    displayName: string;
    wallet: string;
    handle: string | null;
    xUsername: string | null;
    avatarUrl: string | null;
  };
  image: {
    id: string;
    url: string;
    width: number;
    height: number;
    alt: string;
  } | null;
  canDelete: boolean;
  canModerate: boolean;
};
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const localImage = (value: unknown) =>
  typeof value === "string" &&
  /^\/api\/creators\/(?:content\/media|media)\/[a-f0-9]{64}$/.test(value)
    ? value
    : "";

export function startChannelPosts(ctx: Context) {
  const dialog = document.createElement("dialog");
  dialog.id = "channel-post-dialog";
  dialog.className = "creator-dialog post-dialog";
  dialog.setAttribute("aria-labelledby", "post-dialog-title");
  dialog.innerHTML = `<button class="dialog-close" type="button" data-close-post aria-label="Close post composer">×</button><span class="eyebrow accent">[ A LITTLE LOUDER. ]</span><h2 id="post-dialog-title">What's happening?</h2><div id="post-access"></div><form id="channel-post-form" hidden><p class="post-as" id="post-as"></p><label class="sr-only" for="channel-post-text">Your post</label><textarea id="channel-post-text" maxlength="2000" rows="5" placeholder="A thought. A photo. Something your people should see."></textarea><div class="post-attachment" id="post-attachment" hidden><img id="post-image-preview" alt="Your selected image"><button type="button" class="btn btn-small" data-remove-post-image>Remove image ×</button><label for="post-image-alt">Describe the image <span>(optional, for accessibility)</span></label><input id="post-image-alt" maxlength="240" placeholder="What should someone know if they can't see it?"></div><div class="post-composer-toolbar"><label class="btn post-image-picker"><span aria-hidden="true">▧</span> Add image<input id="channel-post-image" type="file" accept="image/*"></label><span id="post-counter" class="mono muted">0 / 2,000</span><button class="btn btn-primary" id="submit-channel-post" type="submit">Post ↗</button></div><p class="post-free"><span aria-hidden="true">✳</span> Text + images. Always free to post.</p><p class="field-help">Posts live on Nikki and can be removed. Permanent video storage is separate.</p></form><p id="channel-post-message" class="field-help" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const floating = document.createElement("button");
  floating.type = "button";
  floating.hidden = location.pathname.startsWith("/communities/");
  floating.className = "btn btn-primary post-floating";
  floating.dataset.newChannelPost = "";
  floating.innerHTML = '<span aria-hidden="true">＋</span> Post';
  floating.setAttribute("aria-label", "Create a channel post");
  document.body.append(floating);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    dialog.querySelector<T>(selector)!;
  const form = $<HTMLFormElement>("#channel-post-form");
  const text = $<HTMLTextAreaElement>("#channel-post-text");
  const alt = $<HTMLInputElement>("#post-image-alt");
  let owner: string | null = null,
    epoch = 0,
    sequence = 0,
    imageSequence = 0;
  let composingHandle = "",
    handle = "",
    busy = false,
    loading = false,
    picking = false,
    pendingOpen = false;
  let feed: HTMLElement | null = null,
    posts: FeedPost[] = [],
    cursor: string | null = null;
  let image: {
    blob: Blob;
    preview: string;
    uploaded?: { id: string; url: string; width: number; height: number };
  } | null = null;
  let pending: { key: string; clientId: string } | null = null;
  const note = (message: string) => {
    $("#channel-post-message").textContent = message;
  };
  function clearImage() {
    imageSequence++;
    if (image) URL.revokeObjectURL(image.preview);
    image = null;
    picking = false;
    $("#post-attachment").hidden = true;
    $<HTMLImageElement>("#post-image-preview").removeAttribute("src");
    $<HTMLInputElement>("#channel-post-image").value = "";
    alt.value = "";
  }
  function lock(value: boolean) {
    busy = value;
    form
      .querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement
      >("input,textarea,button")
      .forEach((el) => {
        el.disabled = value;
      });
    $<HTMLButtonElement>("[data-close-post]").disabled = value;
    $<HTMLButtonElement>("#submit-channel-post").textContent = value
      ? "Posting…"
      : "Post ↗";
    form.setAttribute("aria-busy", String(value));
  }
  function open() {
    if (busy) return;
    const me = ctx.getMe();
    const access = $("#post-access");
    const eligible = !!me.user?.xVerified && !!me.profile?.published;
    form.hidden = !eligible;
    access.hidden = eligible;
    if (!me.user)
      access.innerHTML =
        '<p>Your people want to hear from you. Connect your wallet to start.</p><button class="btn btn-primary" type="button" data-post-connect>Connect wallet ↗</button>';
    else if (!me.user.xVerified)
      access.innerHTML =
        '<p>Pair your X account once, then share text and images for free.</p><a class="btn btn-primary" href="/api/creators/auth/x/start">Pair X ↗</a>';
    else if (!me.profile?.published)
      access.innerHTML =
        '<p>Give your posts a home. Publish your free channel first—no token needed.</p><a class="btn btn-primary" href="/creator-studio/">Set up my channel ↗</a>';
    if (eligible) {
      composingHandle = me.profile.handle;
      $("#post-as").textContent =
        `Posting as ${me.profile.display_name} · @${composingHandle}`;
    }
    note("");
    if (!dialog.open) dialog.showModal();
    if (eligible) text.focus();
  }
  function renderPost(post: FeedPost) {
    const avatar = localImage(post.author.avatarUrl);
    const imageUrl = localImage(post.image?.url);
    const label = post.author.displayName || post.author.wallet.slice(0, 6);
    return `<article class="channel-post-card" id="channel-post-${escape(post.id)}"><header><span class="post-avatar">${avatar ? `<img src="${escape(avatar)}" width="48" height="48" alt="" loading="lazy">` : escape(label.slice(0, 2).toUpperCase())}</span><div><strong>${escape(label)}</strong><span class="post-meta">${post.author.xUsername ? "@" + escape(post.author.xUsername) + " · " : ""}<time datetime="${new Date(post.createdAt * 1000).toISOString()}">${escape(new Date(post.createdAt * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</time></span></div><span class="post-mark" aria-hidden="true">✳</span></header>${post.text ? `<p class="channel-post-body">${escape(post.text)}</p>` : ""}${post.image && imageUrl ? `<a class="channel-post-picture" href="${escape(imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(post.image.alt ? "Open image: " + post.image.alt : "Open attached image")}"><img src="${escape(imageUrl)}" width="${post.image.width}" height="${post.image.height}" alt="${escape(post.image.alt || "Image shared by " + label)}" loading="lazy"></a>` : ""}<footer><span>FREE TO SHARE. FREE TO READ.</span><div>${post.canDelete || post.canModerate ? `<button type="button" data-delete-channel-post="${escape(post.id)}">${post.canDelete ? "Delete post" : "Hide post"}</button>` : ""}<a href="/help/?topic=channel-post&channel=${encodeURIComponent(handle)}&post=${encodeURIComponent(post.id)}">Report</a></div></footer></article>`;
  }
  function draw(canPost = false) {
    if (!feed) return;
    feed.innerHTML = `<div class="section-heading"><div><span class="eyebrow accent">[ THE EVERYDAY GOOD STUFF ]</span><h2>Posts<span class="accent">.</span></h2></div>${canPost ? '<button class="btn btn-primary" data-new-channel-post>＋ Post</button>' : '<span class="post-free-badge">TEXT + IMAGES · FREE</span>'}</div><p class="field-help">Little updates, big thoughts, and everything in between.</p><div class="channel-post-list">${posts.length ? posts.map(renderPost).join("") : `<div class="channel-post-empty"><span aria-hidden="true">✳</span><h3>A quiet corner. For now.</h3><p>${canPost ? "Your first post starts the conversation. Share a thought or a photo." : "New posts from this creator will appear here."}</p>${canPost ? '<button class="btn btn-primary" data-new-channel-post>Write the first post ↗</button>' : ""}</div>`}</div>${cursor ? '<button type="button" class="btn post-more" data-more-channel-posts>More posts ↓</button>' : ""}<p class="field-help">Text and image posts can be removed. Preserved videos live in the archive below.</p>`;
  }
  async function load(more = false) {
    if (!feed || !handle || (more && (!cursor || loading))) return;
    const current = ++sequence,
      version = epoch,
      target = feed;
    loading = true;
    target.setAttribute("aria-busy", "true");
    const moreButton = target.querySelector<HTMLButtonElement>(
      "[data-more-channel-posts]",
    );
    if (moreButton) moreButton.disabled = true;
    try {
      const result = await ctx.request(
        `/channels/${encodeURIComponent(handle)}/posts${more && cursor ? "?before=" + encodeURIComponent(cursor) : ""}`,
      );
      if (version !== epoch || current !== sequence || target !== feed) return;
      posts = more
        ? [
            ...posts,
            ...result.posts.filter(
              (p: FeedPost) => !posts.some((old) => old.id === p.id),
            ),
          ]
        : result.posts;
      cursor = result.nextCursor;
      draw(!!result.permissions?.canPost);
    } catch (error) {
      if (version !== epoch || current !== sequence || target !== feed) return;
      const message =
        error instanceof Error ? error.message : "Posts could not be loaded.";
      if (!more)
        target.innerHTML = `<div class="channel-post-empty"><h3>One moment.</h3><p>${escape(message)}</p><button type="button" class="btn" data-retry-channel-posts>Try again ↻</button></div>`;
      else ctx.toast(message);
    } finally {
      if (current === sequence) loading = false;
      target.setAttribute("aria-busy", "false");
      if (moreButton) moreButton.disabled = false;
    }
  }
  async function mount() {
    const target = document.querySelector<HTMLElement>("[data-channel-feed]");
    if (!target) return;
    let nextHandle = target.dataset.channelHandle || "";
    if (target.dataset.ownChannelFeed !== undefined) {
      const me = ctx.getMe();
      if (!me.user?.xVerified || !me.profile?.published) {
        target.innerHTML =
          '<div class="channel-post-empty"><span aria-hidden="true">✳</span><h3>A home for your updates.</h3><p>Publish your wallet-and-X channel to share text and images for free. No token required.</p><button type="button" class="btn btn-primary" data-new-channel-post>Get started ↗</button></div>';
        feed = null;
        handle = "";
        return;
      }
      nextHandle = me.profile.handle;
    }
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(nextHandle)) return;
    feed = target;
    handle = nextHandle;
    await load();
  }
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>(
      "[data-new-channel-post],[data-more-channel-posts],[data-retry-channel-posts],[data-delete-channel-post]",
    );
    if (!button) return;
    if (button.matches("[data-new-channel-post]")) open();
    if (button.matches("[data-more-channel-posts]")) void load(true);
    if (button.matches("[data-retry-channel-posts]")) void load();
    if (button.dataset.deleteChannelPost) {
      const post = posts.find((p) => p.id === button.dataset.deleteChannelPost);
      if (
        !post ||
        !confirm(
          post.canDelete
            ? "Remove this post from your channel?"
            : "Hide this post from the channel?",
        )
      )
        return;
      const version = epoch,
        savedHandle = handle;
      (button as HTMLButtonElement).disabled = true;
      void ctx
        .request(
          `/channels/${encodeURIComponent(savedHandle)}/posts/${encodeURIComponent(post.id)}/delete`,
          {},
        )
        .then(async () => {
          if (version !== epoch) return;
          ctx.toast(post.canDelete ? "Post removed." : "Post hidden.");
          await load();
        })
        .catch((error) => {
          if (version === epoch)
            ctx.toast(
              error instanceof Error
                ? error.message
                : "The post could not be removed.",
            );
        })
        .finally(() => {
          (button as HTMLButtonElement).disabled = false;
        });
    }
  });
  dialog.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLElement>("button");
    if (!target) return;
    if (target.matches("[data-close-post]") && !busy) dialog.close();
    if (target.matches("[data-remove-post-image]") && !busy) clearImage();
    if (target.matches("[data-post-connect]")) {
      pendingOpen = true;
      dialog.close();
      ctx.connect();
    }
  });
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  text.addEventListener("input", () => {
    $("#post-counter").textContent =
      `${text.value.length.toLocaleString()} / 2,000`;
  });
  $<HTMLInputElement>("#channel-post-image").addEventListener(
    "change",
    async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file || busy) return;
      const version = epoch,
        pick = ++imageSequence;
      picking = true;
      note("Getting your image ready…");
      try {
        const blob = await prepareImage(file, { kind: "post-image" });
        if (version !== epoch || pick !== imageSequence) return;
        if (image) URL.revokeObjectURL(image.preview);
        image = { blob, preview: URL.createObjectURL(blob) };
        $<HTMLImageElement>("#post-image-preview").src = image.preview;
        $("#post-attachment").hidden = false;
        alt.value = "";
        note("Image ready. Add a description if you'd like, then hit Post.");
      } catch (error) {
        if (version === epoch && pick === imageSequence)
          note(
            error instanceof Error ? error.message : "Choose another image.",
          );
      } finally {
        if (pick === imageSequence) picking = false;
      }
    },
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    if (picking) {
      note("Your image is still being prepared.");
      return;
    }
    const value = text.value.trim(),
      imageAlt = alt.value.trim();
    if (!value && !image) {
      note("Add a thought or choose an image first.");
      text.focus();
      return;
    }
    const me = ctx.getMe();
    if (
      !me.user?.xVerified ||
      !me.profile?.published ||
      me.profile.handle !== composingHandle
    ) {
      open();
      return;
    }
    const version = epoch,
      targetHandle = composingHandle,
      attachment = image;
    lock(true);
    note(attachment ? "Uploading your image…" : "Sending your post…");
    void (async () => {
      try {
        if (attachment && !attachment.uploaded)
          attachment.uploaded = await uploadImage(
            attachment.blob,
            "post-image",
          );
        if (version !== epoch) return;
        const imageId = attachment?.uploaded?.id || "";
        const key = JSON.stringify([value, imageId, imageAlt]);
        if (!pending || pending.key !== key)
          pending = { key, clientId: crypto.randomUUID() };
        await ctx.request(
          `/channels/${encodeURIComponent(targetHandle)}/posts`,
          {
            text: value,
            imageId: imageId || undefined,
            imageAlt,
            clientId: pending.clientId,
          },
        );
        if (version !== epoch) return;
        pending = null;
        text.value = "";
        $("#post-counter").textContent = "0 / 2,000";
        clearImage();
        note("");
        dialog.close();
        ctx.toast("Posted. Your people can see it now. ♡");
        await mount();
      } catch (error) {
        if (version === epoch)
          note(
            error instanceof Error
              ? error.message
              : "Your post is saved here. Try again.",
          );
      } finally {
        if (version === epoch) lock(false);
      }
    })();
  });
  addEventListener("pagehide", (event) => {
    // Back/forward-cache navigation keeps the draft alive, including its preview URL.
    if (!event.persisted && image) URL.revokeObjectURL(image.preview);
  });
  return {
    mount,
    async accountChanged() {
      const wallet = ctx.getMe().user?.wallet || null;
      if (owner !== wallet) {
        owner = wallet;
        epoch++;
        sequence++;
        pending = null;
        clearImage();
        text.value = "";
        $("#post-counter").textContent = "0 / 2,000";
        composingHandle = "";
        lock(false);
        dialog.close();
      }
      await mount();
      if (pendingOpen && wallet) {
        pendingOpen = false;
        open();
      }
    },
  };
}
