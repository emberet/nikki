"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type FeedVideo = {
  id: string;
  title: string;
  description: string;
  creator: string;
  arweaveTx: string;
  sizeBytes: string;
  publishedAt: string;
};

function fmtSize(b: string) {
  const n = Number(b);
  if (n > 1e9) return (n / 1e9).toFixed(2) + " GB";
  if (n > 1e6) return (n / 1e6).toFixed(1) + " MB";
  return (n / 1e3).toFixed(0) + " KB";
}

export default function Home() {
  const [videos, setVideos] = useState<FeedVideo[] | null>(null);

  useEffect(() => {
    fetch("/api/feed").then(async (r) => setVideos(await r.json()));
  }, []);

  return (
    <main>
      <div className="hero">
        <h1>
          Video that lives <span>forever</span>
        </h1>
        <p>
          Every video here is permanently stored on Arweave. Human-reviewed
          before publishing — and once live, no one on earth can delete it. Not
          us. Not the creator. Nobody.
        </p>
      </div>
      <div className="container">
        {videos === null ? (
          <p className="muted">Loading…</p>
        ) : videos.length === 0 ? (
          <p className="muted">No videos published yet. Be the first — hit Upload.</p>
        ) : (
          <div className="grid">
            {videos.map((v) => (
              <Link key={v.id} href={`/watch/${v.arweaveTx}`} style={{ textDecoration: "none" }}>
                <div className="card video-card">
                  <div className="thumb">▶</div>
                  <div className="meta">
                    <h3>{v.title}</h3>
                    <div className="sub">
                      {v.creator.slice(0, 4)}…{v.creator.slice(-4)} · {fmtSize(v.sizeBytes)} ·{" "}
                      {new Date(v.publishedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
