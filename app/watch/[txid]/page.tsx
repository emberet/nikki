import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { sizeLabel, shortWallet } from "@/lib/client";
export const dynamic = "force-dynamic";
export default async function Watch({
  params,
}: {
  params: Promise<{ txid: string }>;
}) {
  const { txid } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(txid)) notFound();
  const video = await db.video.findUnique({
    where: { arweaveTx: txid },
    include: { creator: true, ballots: true, founderRecord: true },
  });
  if (!video || video.status !== "published") notFound();
  const src = "https://arweave.net/" + video.arweaveTx;
  return (
    <main className="container">
      <Link href="/" className="eyebrow muted">
        ← Back to the archive
      </Link>
      <div className="player-frame" style={{ marginTop: 28 }}>
        <div className="panel-title">
          <span>● The permanent record</span>
          <span>{video.category}</span>
        </div>
        <video controls preload="metadata" src={src} />
      </div>
      <section className="two-col">
        <article>
          <span className="badge published">Preserved</span>
          <h1 style={{ fontSize: "clamp(2rem,4vw,3.5rem)", marginTop: 20 }}>
            {video.title}
          </h1>
          <p className="mono muted">
            By {shortWallet(video.creator.wallet)} ·{" "}
            {video.publishedAt?.toLocaleDateString()} ·{" "}
            {sizeLabel(video.sizeBytes.toString())}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{video.description}</p>
          <dl>
            <dt className="eyebrow muted">Language</dt>
            <dd>{video.language}</dd>
            {video.recordedAt && (
              <>
                <dt className="eyebrow muted">Recorded</dt>
                <dd>{video.recordedAt}</dd>
              </>
            )}
            {video.source && (
              <>
                <dt className="eyebrow muted">Source / attribution</dt>
                <dd>{video.source}</dd>
              </>
            )}
          </dl>
          {video.publicationMethod === "founder" ? (
            <section style={{ marginTop: 40 }}>
              <span className="badge">Founding record</span>
              <h2>Published by Nikki’s founder</h2>
              <p>
                The founder signed this record for permanent preservation. It
                was published before token-holder voting opened.
              </p>
              <p className="footnote">
                The signed founder approval is included in the permanent review
                record.
              </p>
            </section>
          ) : (
            <>
              <h2 style={{ marginTop: 40 }}>Community approval</h2>
              <p>
                {video.yesCount} approve · {video.noCount} decline · vote closed{" "}
                {video.voteClosesAt?.toLocaleDateString()}
              </p>
              <div className="btn-row">
                {video.ballots
                  .filter((b) => b.choice === "yes")
                  .map((b) => (
                    <a
                      key={b.id}
                      className="badge"
                      href={"https://x.com/" + encodeURIComponent(b.xUsername)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{b.xUsername}
                    </a>
                  ))}
              </div>
              <p className="footnote" style={{ marginTop: 16 }}>
                Each approval is that moderator’s personal decision to publish
                this record.
              </p>
            </>
          )}
        </article>
        <aside className="card">
          <div className="eyebrow accent">Verify the record</div>
          <h2 style={{ marginTop: 20 }}>
            Stored. Signed.
            <br />
            Accounted for.
          </h2>
          <details>
            <summary>File fingerprint</summary>
            <p className="mono">{video.sha256}</p>
          </details>
          <hr className="divider" />
          <details>
            <summary>Storage transaction</summary>
            <p className="mono">{video.arweaveTx}</p>
          </details>
          <hr className="divider" />
          <a className="btn" href={src} target="_blank" rel="noreferrer">
            Open independent copy ↗
          </a>
          {video.recordTx && (
            <a
              className="btn"
              style={{ marginTop: 16 }}
              href={"https://arweave.net/" + video.recordTx}
              target="_blank"
              rel="noreferrer"
            >
              Open permanent review record ↗
            </a>
          )}
          <p className="footnote" style={{ marginTop: 24 }}>
            Nikki provides no deletion or delisting for published records.
            Independent retrieval depends on the storage network and gateway
            availability.
          </p>
          <a
            className="footnote"
            href="/api/mod/audit"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline" }}
          >
            View signed publication records →
          </a>
        </aside>
      </section>
    </main>
  );
}
