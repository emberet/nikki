"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Video = {
  id: string;
  title: string;
  description: string;
  creator: string;
  arweaveTx: string;
  sizeBytes: string;
  publishedAt: string;
  category?: string;
};
export default function Home() {
  const [founderLaunch, setFounderLaunch] = useState(false);
  const [videos, setVideos] = useState<Video[] | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All records");
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setFounderLaunch(c.releaseMode === "founder"))
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/feed")
      .then(async (r) => {
        if (!r.ok)
          throw Error("The archive could not be loaded. Please try again.");
        setVideos(await r.json());
      })
      .catch((e) => setError(e.message));
  }, []);
  const filtered = (videos || []).filter(
    (v) =>
      (category === "All records" || v.category === category) &&
      (v.title + " " + v.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main className="container">
      <section className="hero">
        <div>
          <div className="eyebrow accent">[ 01 — THE ARCHIVE ]</div>
          <h1>
            Some things
            <br />
            deserve <span>forever.</span>
          </h1>
          <p>
            The stories we tell. The things we discover. A community-built
            record of human history and knowledge, preserved through video.
          </p>
          <div className="btn-row">
            <Link
              href={founderLaunch ? "/about" : "/studio"}
              className="btn btn-primary"
            >
              {founderLaunch ? "Explore Nikki ↗" : "Preserve a video ↗"}
            </Link>
            <Link href="/about" className="btn">
              How it works →
            </Link>
          </div>
        </div>
        <aside className="archive-stamp" aria-label="Archive status">
          <div className="panel-title">
            <span>● Archive ledger</span>
            <span>№ 001</span>
          </div>
          <div className="stamp-body">
            <div className="stamp-number">
              {videos === null ? "—" : String(videos.length).padStart(3, "0")}
            </div>
            <div>
              <div className="eyebrow" style={{ marginTop: 12 }}>
                Records preserved
              </div>
              <p className="footnote" style={{ margin: "12px 0 0" }}>
                {founderLaunch
                  ? "A first record. A lasting beginning."
                  : "Every record begins with a community decision."}
              </p>
            </div>
          </div>
          <div className="stamp-rules">
            <div>
              <strong>24h</strong>
              <small>VOTING WINDOW</small>
            </div>
            <div>
              <strong>80%</strong>
              <small>APPROVAL</small>
            </div>
            <div>
              <strong>∞</strong>
              <small>THE AMBITION</small>
            </div>
          </div>
        </aside>
      </section>
      {founderLaunch && (
        <div className="notice" style={{ marginBottom: 32 }}>
          Nikki starts with its founder’s first record. Public submissions and
          community voting open after the NIKKI token launch.
        </div>
      )}
      <section aria-labelledby="archive-title">
        <div className="section-heading">
          <h2 id="archive-title">
            The permanent record<span className="accent">.</span>
          </h2>
          <span className="eyebrow muted">
            {videos?.length ?? 0} RECORDS / OPEN TO EVERYONE
          </span>
        </div>
        <div className="toolbar">
          <div className="filters">
            {["All records", "History", "Knowledge", "Culture"].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={"filter " + (category === c ? "active" : "")}
                aria-pressed={category === c}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="search">
            <span className="search-icon" aria-hidden="true">
              ⌕
            </span>
            <label htmlFor="archive-search" className="sr-only">
              Search the archive
            </label>
            <input
              id="archive-search"
              type="search"
              placeholder="Search stories, ideas, discoveries…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {error ? (
          <div role="alert" className="error">
            {error}
          </div>
        ) : videos === null ? (
          <div className="grid" aria-label="Loading archive">
            {[1, 2, 3].map((i) => (
              <div className="skeleton" key={i} />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="grid">
            {filtered.map((v) => (
              <Link
                href={"/watch/" + v.arweaveTx}
                className="card video-card"
                key={v.id}
              >
                <div className="thumb">
                  <span className="thumb-play">▶</span>
                  <span className="thumb-label">
                    {(Number(v.sizeBytes) / 1e6).toFixed(0)} MB
                  </span>
                </div>
                <div className="meta">
                  <span className="badge published">Preserved</span>
                  <h3>{v.title}</h3>
                  <div className="mono muted">
                    {v.creator.slice(0, 4)}…{v.creator.slice(-4)} ·{" "}
                    {new Date(v.publishedAt).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-symbol" aria-hidden="true">
              [ + ]
            </div>
            <h3>
              {videos.length
                ? "No matching records"
                : "History starts with a first record."}
            </h3>
            <p>
              {videos.length
                ? "Try another search or category."
                : founderLaunch
                  ? "The founder’s first video is coming soon. Records appear after permanent storage is verified."
                  : "The archive is ready for its first contribution. Submit a video for the community to review."}
            </p>
            <Link href={founderLaunch ? "/about" : "/studio"} className="btn">
              {founderLaunch ? "How Nikki works ↗" : "Make a contribution ↗"}
            </Link>
          </div>
        )}
      </section>
      <div className="notice" style={{ marginTop: 28 }}>
        A record enters the archive only after signed approval and verified
        storage. The founding record is approved by its creator; later
        submissions follow community voting.{" "}
        <Link href="/about" style={{ textDecoration: "underline" }}>
          Read the preservation model →
        </Link>
      </div>
    </main>
  );
}
