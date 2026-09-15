import {
  estimateStorageLamports,
  formatStorageSol,
} from "../lib/storage-estimate";

type StorageRate = {
  wincPerGiB: string;
  wincPerSol: string;
  updatedAt: string;
  expiresAt: string;
};

const section = document.querySelector<HTMLElement>("[data-storage-pricing]");
if (section) {
  const slider = section.querySelector<HTMLInputElement>("#storage-size")!;
  const sizeLabel = section.querySelector<HTMLOutputElement>(
    "#storage-size-label",
  )!;
  const price = section.querySelector<HTMLOutputElement>("#storage-price")!;
  const priceCard = section.querySelector<HTMLElement>(".storage-price-card")!;
  const status = section.querySelector<HTMLElement>("#storage-rate-status")!;
  const refresh = section.querySelector<HTMLButtonElement>(
    "#storage-rate-refresh",
  )!;
  const announcement = section.querySelector<HTMLElement>(
    "#storage-price-announcement",
  )!;
  const presets =
    section.querySelectorAll<HTMLButtonElement>("[data-storage-mb]");
  let rate: StorageRate | null = null;
  let pending = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function isFresh() {
    return rate !== null && Date.parse(rate.expiresAt) > Date.now();
  }

  function selectedSize() {
    const mb = Number(slider.value);
    return mb === 1000 ? "1 GB" : `${mb} MB`;
  }

  function renderSize(announce = false) {
    const label = selectedSize();
    sizeLabel.value = label;
    slider.setAttribute("aria-valuetext", label);
    presets.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.storageMb === slider.value),
      );
    });
    if (rate && isFresh()) {
      const sol = formatStorageSol(
        estimateStorageLamports(rate, Number(slider.value) * 1_000_000),
      );
      price.replaceChildren(document.createTextNode(`≈ ${sol} `));
      const unit = document.createElement("small");
      unit.textContent = "SOL";
      price.append(unit);
      if (announce)
        announcement.textContent = `${label}: approximately ${sol} SOL for video storage, before metadata and network fees.`;
    } else {
      price.textContent = "— SOL";
      if (rate && !pending) void loadRate();
    }
  }

  function validRate(value: unknown): value is StorageRate {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<StorageRate>;
    if (
      typeof item.wincPerGiB !== "string" ||
      !/^[1-9]\d{0,39}$/.test(item.wincPerGiB) ||
      typeof item.wincPerSol !== "string" ||
      !/^[1-9]\d{0,39}$/.test(item.wincPerSol) ||
      typeof item.updatedAt !== "string" ||
      typeof item.expiresAt !== "string"
    )
      return false;
    const updated = Date.parse(item.updatedAt);
    const expires = Date.parse(item.expiresAt);
    return (
      Number.isFinite(updated) &&
      Number.isFinite(expires) &&
      updated <= Date.now() + 60_000 &&
      expires > Date.now() &&
      expires > updated &&
      expires - updated <= 15 * 60_000
    );
  }

  async function loadRate() {
    if (pending) return;
    pending = true;
    clearTimeout(expiryTimer);
    refresh.disabled = true;
    priceCard.setAttribute("aria-busy", "true");
    status.textContent = "Fetching today’s storage rate…";
    section!.dataset.rateState = "loading";
    if (!isFresh()) price.textContent = "— SOL";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/creators/storage-pricing", {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok) throw new Error("Rate unavailable");
      const data: unknown = await response.json();
      if (!validRate(data)) throw new Error("Rate unavailable");
      rate = data;
      section!.dataset.rateState = "ready";
      const time = new Date(rate.updatedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const date = new Date(rate.updatedAt).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
      status.textContent = `Rate checked ${date}, ${time}. Refreshes every 15 minutes.`;
      refresh.textContent = "Refresh ↻";
      renderSize();
      expiryTimer = setTimeout(
        () => {
          price.textContent = "— SOL";
          void loadRate();
        },
        Math.max(1, Date.parse(rate.expiresAt) - Date.now() + 10),
      );
    } catch {
      rate = null;
      price.textContent = "— SOL";
      section!.dataset.rateState = "error";
      status.textContent = "Storage rates are taking a moment. Try again.";
      refresh.textContent = "Try again ↻";
    } finally {
      clearTimeout(timeout);
      pending = false;
      refresh.disabled = false;
      priceCard.setAttribute("aria-busy", "false");
    }
  }

  slider.addEventListener("input", () => renderSize());
  slider.addEventListener("change", () => renderSize(true));
  presets.forEach((button) =>
    button.addEventListener("click", () => {
      slider.value = button.dataset.storageMb!;
      renderSize(true);
    }),
  );
  refresh.addEventListener("click", () => void loadRate());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && rate && !isFresh()) void loadRate();
  });
  void loadRate();
}
