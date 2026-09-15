"use client";
import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import SignInButton, { useAuth } from "@/components/SignInButton";

const CHUNK = 8 * 1024 * 1024;

type Quote = {
  videoId: string;
  sizeBytes: number;
  sha256: string;
  quoteLamports: string;
  quoteToken: string;
  treasury: string;
};

type MyVideo = {
  id: string;
  title: string;
  status: string;
  sizeBytes: string;
  arweaveTx: string | null;
  quoteLamports?: string;
  paymentStatus?: string;
  refundTx?: string | null;
  rejectionReason?: string | null;
};

export default function Studio() {
  const { me, loaded, refresh } = useAuth();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "quote" | "paying" | "done">("idle");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<MyVideo[]>([]);

  const loadMine = async () => {
    const r = await fetch("/api/my-videos");
    if (r.ok) setMine(await r.json());
  };
  useEffect(() => {
    if (me) loadMine();
  }, [me]);

  const upload = async () => {
    if (!file || !title) return;
    setError("");
    setPhase("uploading");
    try {
      const init = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, mimeType: file.type || "video/mp4" }),
      });
      if (!init.ok) throw new Error((await init.json()).error);
      const { videoId } = await init.json();

      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK);
        const r = await fetch(`/api/upload/chunk?videoId=${videoId}&offset=${offset}`, {
          method: "POST",
          body: slice,
        });
        if (r.status === 409) {
          offset = (await r.json()).expected;
          continue;
        }
        if (!r.ok) throw new Error((await r.json()).error);
        offset += slice.size;
        setProgress(Math.round((offset / file.size) * 100));
      }

      const done = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (!done.ok) throw new Error((await done.json()).error);
      setQuote(await done.json());
      setPhase("quote");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  const paySol = async () => {
    if (!quote || !publicKey) return;
    setError("");
    setPhase("paying");
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(quote.treasury),
          lamports: Number(quote.quoteLamports),
        })
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      const r = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: quote.videoId, signature: sig, currency: "SOL" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setPhase("done");
      loadMine();
    } catch (e) {
      setError((e as Error).message);
      setPhase("quote");
    }
  };

  if (!loaded) return <main className="container"><p className="muted">Loading…</p></main>;
  if (!me)
    return (
      <main className="container" style={{ maxWidth: 480, textAlign: "center", paddingTop: 80 }}>
        <h2>Creator studio</h2>
        <p className="muted">Connect and sign in with your Solana wallet to upload.</p>
        <SignInButton onAuthed={refresh} />
      </main>
    );

  return (
    <main className="container" style={{ maxWidth: 720 }}>
      <h2>Upload a video</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Your file is held privately until a human reviewer approves it. On
        approval it is pushed to Arweave — permanently. You pay the one-time
        storage fee up front; rejected uploads are refunded minus a small
        processing fee.
      </p>

      {phase === "idle" || phase === "uploading" ? (
        <div className="card">
          <label>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <label>Description</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <label>Video file</label>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file && (
            <p className="muted" style={{ fontSize: 12 }}>
              {(file.size / 1e6).toFixed(1)} MB — fee quoted after upload
            </p>
          )}
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            disabled={!file || !title || phase === "uploading"}
            onClick={upload}
          >
            {phase === "uploading" ? `Uploading ${progress}%` : "Upload for review"}
          </button>
          {phase === "uploading" && (
            <div className="progress"><div style={{ width: `${progress}%` }} /></div>
          )}
        </div>
      ) : phase === "quote" || phase === "paying" ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Storage fee</h3>
          <p>
            Permanent storage for {(quote!.sizeBytes / 1e6).toFixed(1)} MB:{" "}
            <strong>{(Number(quote!.quoteLamports) / 1e9).toFixed(5)} SOL</strong>
          </p>
          <p className="muted mono" style={{ fontSize: 11 }}>sha256 {quote!.sha256}</p>
          <button className="btn btn-primary" onClick={paySol} disabled={phase === "paying"}>
            {phase === "paying" ? "Confirming…" : "Pay with SOL"}
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="success">Paid ✓ — your video is now in the human review queue.</p>
          <button className="btn" onClick={() => { setPhase("idle"); setQuote(null); setFile(null); setTitle(""); setDescription(""); setProgress(0); }}>
            Upload another
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <h2 style={{ marginTop: 40 }}>My videos</h2>
      <table>
        <thead>
          <tr><th>Title</th><th>Status</th><th>Details</th></tr>
        </thead>
        <tbody>
          {mine.map((v) => (
            <tr key={v.id}>
              <td>{v.title}</td>
              <td><span className={`badge ${v.status}`}>{v.status}</span></td>
              <td className="mono">
                {v.arweaveTx && (
                  <a href={`/watch/${v.arweaveTx}`}>watch</a>
                )}
                {v.rejectionReason && <span className="muted"> {v.rejectionReason}</span>}
                {v.refundTx && <span className="muted"> refund: {v.refundTx.slice(0, 8)}…</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
