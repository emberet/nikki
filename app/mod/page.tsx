"use client";
import { useEffect, useState, useCallback } from "react";
import SignInButton, { useAuth } from "@/components/SignInButton";

type QueueItem = {
  id: string;
  title: string;
  description: string;
  creator: string;
  sizeBytes: string;
  sha256: string;
  paid: boolean;
  currency?: string;
  createdAt: string;
};

type AuditRow = {
  id: string;
  video: { id: string; title: string; arweaveTx: string | null };
  mod: string;
  decision: string;
  reason: string;
  createdAt: string;
};

export default function ModPortal() {
  const { me, loaded, refresh } = useAuth();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [active, setActive] = useState<QueueItem | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [q, a] = await Promise.all([fetch("/api/mod/queue"), fetch("/api/mod/audit")]);
    if (q.ok) setQueue(await q.json());
    else setQueue(null);
    if (a.ok) setAudit(await a.json());
  }, []);

  useEffect(() => {
    if (me?.role === "mod" || me?.role === "admin") load();
  }, [me, load]);

  const decide = async (decision: "approved" | "rejected") => {
    if (!active) return;
    if (decision === "approved" && !confirm(
      `APPROVE "${active.title}"?\n\nThis pushes the file to Arweave PERMANENTLY. It can never be deleted by anyone. Are you sure?`
    )) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/mod/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: active.id, decision, reason }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(decision === "approved" ? `Published: ${j.arweaveTx}` : `Rejected. Refund: ${j.refundTx || "pending"}`);
      setActive(null);
      setReason("");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <main className="container"><p className="muted">Loading…</p></main>;
  if (!me || (me.role !== "mod" && me.role !== "admin"))
    return (
      <main className="container" style={{ maxWidth: 480, textAlign: "center", paddingTop: 80 }}>
        <h2>Mod portal</h2>
        <p className="muted">Restricted to reviewer wallets.</p>
        <SignInButton onAuthed={refresh} />
      </main>
    );

  return (
    <main className="container">
      <h2>Review queue {queue && <span className="badge">{queue.length} waiting</span>}</h2>
      {msg && <p className="mono" style={{ fontSize: 12 }}>{msg}</p>}

      {active ? (
        <div className="card" style={{ maxWidth: 860 }}>
          <video controls src={`/api/mod/preview/${active.id}`} />
          <h3>{active.title}</h3>
          <p className="muted" style={{ fontSize: 13 }}>{active.description || "(no description)"}</p>
          <p className="mono muted" style={{ fontSize: 11 }}>
            creator {active.creator} · {(Number(active.sizeBytes) / 1e6).toFixed(1)} MB · sha256 {active.sha256}
          </p>
          <label>Reason (required for rejection, optional for approval)</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button className="btn btn-approve" disabled={busy} onClick={() => decide("approved")}>
              {busy ? "Working…" : "Approve → Arweave (permanent)"}
            </button>
            <button className="btn btn-danger" disabled={busy || !reason} onClick={() => decide("rejected")}>
              Reject + refund
            </button>
            <button className="btn" disabled={busy} onClick={() => setActive(null)}>Back</button>
          </div>
        </div>
      ) : (
        <table>
          <thead>
            <tr><th>Title</th><th>Creator</th><th>Size</th><th>Paid</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            {(queue || []).map((v) => (
              <tr key={v.id}>
                <td>{v.title}</td>
                <td className="mono">{v.creator.slice(0, 4)}…{v.creator.slice(-4)}</td>
                <td>{(Number(v.sizeBytes) / 1e6).toFixed(1)} MB</td>
                <td>{v.paid ? `✓ ${v.currency}` : "✗"}</td>
                <td>{new Date(v.createdAt).toLocaleString()}</td>
                <td><button className="btn" onClick={() => setActive(v)}>Review</button></td>
              </tr>
            ))}
            {queue?.length === 0 && (
              <tr><td colSpan={6} className="muted">Queue is empty.</td></tr>
            )}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 40 }}>Audit log</h2>
      <table>
        <thead>
          <tr><th>When</th><th>Video</th><th>Mod</th><th>Decision</th><th>Reason</th></tr>
        </thead>
        <tbody>
          {audit.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>
                {r.video.arweaveTx ? (
                  <a href={`/watch/${r.video.arweaveTx}`}>{r.video.title}</a>
                ) : (
                  r.video.title
                )}
              </td>
              <td className="mono">{r.mod.slice(0, 4)}…{r.mod.slice(-4)}</td>
              <td><span className={`badge ${r.decision}`}>{r.decision}</span></td>
              <td className="muted">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
