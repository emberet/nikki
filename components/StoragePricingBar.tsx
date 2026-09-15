"use client";

import { useEffect, useId, useState } from "react";
import {
  estimateStorageLamports,
  formatStorageSol,
  type StorageRate,
} from "@/lib/storage-estimate";

export default function StoragePricingBar({
  bytes,
  founder = false,
}: {
  bytes?: number;
  founder?: boolean;
}) {
  const id = useId();
  const [mb, setMb] = useState(100);
  const [rate, setRate] = useState<StorageRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const size = bytes ?? mb * 1_000_000;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let renewal: ReturnType<typeof setTimeout>;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError("");
    setRate(null);
    fetch("/api/storage-pricing", {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            "Storage pricing is taking a little break. Try again shortly.",
          );
        const data = (await response.json()) as StorageRate;
        estimateStorageLamports(data, 100_000_000);
        const expiry = Date.parse(data.expiresAt);
        if (
          !Number.isFinite(expiry) ||
          expiry <= Date.now() ||
          !Number.isFinite(Date.parse(data.updatedAt))
        )
          throw Error("That estimate has expired. Refresh for a new one.");
        if (!active) return;
        setRate(data);
        renewal = setTimeout(
          () => setRefresh((n) => n + 1),
          Math.min(expiry - Date.now(), 900_000),
        );
      })
      .catch(() => {
        if (active)
          setError(
            "We couldn’t fetch a fresh storage estimate. Try again shortly.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      clearTimeout(renewal);
    };
  }, [refresh]);
  const validSize =
    Number.isSafeInteger(size) && size > 0 && size <= 1_000_000_000;
  const price =
    rate && validSize && Date.parse(rate.expiresAt) > Date.now()
      ? formatStorageSol(estimateStorageLamports(rate, size))
      : null;
  const sizeLabel =
    size === 1_000_000_000
      ? "1 GB"
      : `${(size / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;
  useEffect(() => {
    const delay = setTimeout(
      () =>
        setAnnouncement(
          price
            ? `${sizeLabel}: approximately ${price} SOL for video storage.`
            : "",
        ),
      400,
    );
    return () => clearTimeout(delay);
  }, [price, sizeLabel]);
  return (
    <section
      className="storage-pricing storage-pricing--compact"
      aria-labelledby={`${id}-heading`}
    >
      <div className="storage-pricing-heading">
        <div>
          <span className="eyebrow">A LITTLE SPACE FOR SOMETHING BIG</span>
          <h2 id={`${id}-heading`}>Your story. One storage fee.</h2>
        </div>
        <span className="storage-sticker">
          NIKKI’S CUT
          <br />
          <strong>0 SOL</strong>
        </span>
      </div>
      <div className="storage-estimator">
        <div className="storage-size-control">
          <div className="storage-size-heading">
            <label htmlFor={`${id}-size`}>
              {bytes !== undefined ? "Your selected video" : "Try a video size"}
            </label>
            <output aria-live="off">{sizeLabel}</output>
          </div>
          <input
            id={`${id}-size`}
            type="range"
            min="1"
            max="1000"
            step="1"
            value={Math.min(1000, Math.max(1, Math.round(size / 1_000_000)))}
            disabled={bytes !== undefined}
            onChange={(event) => setMb(Number(event.target.value))}
            aria-valuetext={sizeLabel}
          />
          <div className="storage-presets" aria-label="Example video sizes">
            {[100, 500, 1000].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={size === value * 1_000_000}
                disabled={bytes !== undefined}
                onClick={() => setMb(value)}
              >
                {value === 1000 ? "1 GB" : `${value} MB`}
              </button>
            ))}
          </div>
          {bytes !== undefined && (
            <p className="footnote">
              Sized from your file. No upload is needed to estimate it.
            </p>
          )}
        </div>
        <div className="storage-price-card">
          <span className="storage-price-label">ESTIMATED VIDEO STORAGE</span>
          <output
            className="storage-price"
            aria-label="Estimated video storage"
            aria-live="off"
          >
            {price ? `≈ ${price} ` : "— "}
            <small>SOL</small>
          </output>
          <small>One time. No monthly storage bill.</small>
        </div>
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <div className="storage-fee-route" aria-label="Where the fees go">
        <span>
          Storage <b>→ Turbo / Arweave</b>
        </span>
        <span>
          Network <b>→ Solana</b>
        </span>
        <span>
          Nikki <b>→ 0 SOL ♡</b>
        </span>
      </div>
      <p className="footnote">
        Estimate for video storage only. Metadata, provider per-item charges,
        and Solana network fees are extra. You review a final quote after
        approval.
      </p>
      <p id={`${id}-status`} role="status" className="footnote">
        {!validSize
          ? "Choose a video up to 1 GB."
          : loading
            ? "Checking storage prices…"
            : error ||
              (rate
                ? `Price checked ${new Date(rate.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Estimates refresh every 15 minutes.`
                : "")}
      </p>
      <button
        className="btn btn-small"
        type="button"
        disabled={loading}
        onClick={() => setRefresh((n) => n + 1)}
      >
        {loading ? "Checking…" : "Refresh estimate ↻"}
      </button>
      <details className="storage-pricing-detail">
        <summary>Who receives the fee?</summary>
        <p>
          Turbo provides upload credits for storage on Arweave. In Nikki’s
          payment flow, SOL goes to the operational payment wallet shown at
          checkout to cover those storage costs. Nikki adds no markup and takes
          no cut of your storage payment. Solana’s separate transaction fee pays
          the network.
        </p>
        <a
          href="https://docs.ar.io/build/upload/turbo-credits#pricing--fees"
          target="_blank"
          rel="noreferrer"
        >
          Turbo’s pricing explained ↗
        </a>
      </details>
      {founder && (
        <p className="storage-upload-note">
          Your first founder video uses project-funded storage. This is a cost
          preview, not a request to pay.
        </p>
      )}
    </section>
  );
}
