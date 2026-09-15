import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function WatchPage({ params }: { params: { txid: string } }) {
  const video = await db.video.findUnique({
    where: { arweaveTx: params.txid },
    include: { creator: true, review: true },
  });
  if (!video || video.status !== "approved") notFound();

  const src = `https://arweave.net/${video.arweaveTx}`;
  return (
    <main className="container" style={{ maxWidth: 900 }}>
      <video controls preload="metadata" src={src} />
      <h1 style={{ fontSize: 24, margin: "16px 0 4px" }}>{video.title}</h1>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        by <span className="mono">{video.creator.wallet}</span> ·{" "}
        {video.publishedAt?.toLocaleDateString()}
      </div>
      {video.description && <p style={{ lineHeight: 1.6 }}>{video.description}</p>}
      <div className="card" style={{ marginTop: 20 }}>
        <strong style={{ fontSize: 13 }}>Permanence proof</strong>
        <div className="mono muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
          Arweave tx:{" "}
          <a href={`https://viewblock.io/arweave/tx/${video.arweaveTx}`} target="_blank">
            {video.arweaveTx}
          </a>
          <br />
          sha256: {video.sha256}
          <br />
          Direct gateway: <a href={src} target="_blank">{src}</a>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          This file is stored permanently on the Arweave network. It cannot be
          edited or deleted by the creator, this site, or anyone else.
        </p>
      </div>
    </main>
  );
}
