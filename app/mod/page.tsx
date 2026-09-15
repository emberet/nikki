"use client";
import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import SignInButton, { useAuth } from "@/components/SignInButton";
import { post, sizeLabel, timeLeft, shortWallet } from "@/lib/client";
import { statusLabel } from "@/lib/rules";
type Proposal = {
  id: string;
  title: string;
  description: string;
  category: string;
  creator: string;
  sizeBytes: string;
  sha256: string;
  status: string;
  voteClosesAt: string;
  snapshotSlot: string;
  yes: number;
  no: number;
  canVote: boolean;
  myVote: string | null;
};
export default function Review() {
  const { me, loaded } = useAuth(),
    { publicKey, signMessage } = useWallet();
  const [queue, setQueue] = useState<Proposal[]>([]),
    [active, setActive] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [attest, setAttest] = useState(false),
    [xReady, setXReady] = useState(false),
    [ready, setReady] = useState(false),
    [filter, setFilter] = useState("Open votes"),
    [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    if (!me) return;
    const r = await fetch("/api/mod/queue");
    if (r.ok) setQueue(await r.json());
    else setError("The review queue could not be loaded.");
  }, [me]);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setXReady(c.xConfigured);
        setReady(c.votingConfigured);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load().catch(() => setError("The queue is unavailable."));
    const t = setInterval(() => {
      setNow(Date.now());
      load().catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [load]);
  const chosen = queue.find((v) => v.id === active);
  const vote = async (choice: "yes" | "no") => {
    if (!chosen || !signMessage || !me || !attest) return;
    if (publicKey?.toBase58() !== me.wallet) {
      setError("Connect the wallet linked to your moderator account.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const ballot = await post("/api/voting/message", {
        videoId: chosen.id,
        choice,
        reason,
      });
      const signature = bs58.encode(
        await signMessage(new TextEncoder().encode(ballot.message)),
      );
      await post("/api/voting/ballot", {
        videoId: chosen.id,
        choice,
        reason,
        signature,
        issuedAt: ballot.issuedAt,
      });
      setNotice(
        "Your signed vote is recorded. The result is decided when the full 24-hour window closes.",
      );
      setAttest(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const visible = queue.filter(
    (v) => filter === "All decisions" || v.status === "voting",
  );
  return (
    <main className="container">
      <header className="page-header">
        <div className="eyebrow accent">[ 03 — COMMUNITY REVIEW ]</div>
        <h1>
          Decide what endures<span className="accent">.</span>
        </h1>
        <p>
          Review the next contribution to human history. Your vote is your
          personal approval of a specific record.
        </p>
      </header>
      <div className="rule-grid">
        <div className="rule-card">
          <strong>24 hours</strong>
          <span>Every voice has time to be heard</span>
        </div>
        <div className="rule-card">
          <strong>5 voters</strong>
          <span>Minimum participation</span>
        </div>
        <div className="rule-card">
          <strong>80% yes</strong>
          <span>Required for approval</span>
        </div>
      </div>
      {!loaded ? (
        <div className="loading">Loading moderator access…</div>
      ) : !me ? (
        <div className="signin-panel">
          <div className="eyebrow accent">A community of custodians</div>
          <h2>Bring your judgment.</h2>
          <p>
            Connect a wallet holding more than 10 million NIKKI, then link your
            X account. Each eligible wallet gets one vote.
          </p>
          <SignInButton />
          <p className="footnote" style={{ marginTop: 24, marginBottom: 0 }}>
            Wallet eligibility is fixed when each vote opens.
          </p>
        </div>
      ) : (
        <>
          <section className="notice">
            <div className="submission-head">
              <div>
                <strong>
                  {me.xLinked
                    ? "X connected · @" + me.xUsername
                    : "Link your X account"}
                </strong>
                <p style={{ margin: "6px 0 0" }}>
                  {me.xLinked
                    ? "Votes are attributed to your linked account. Each proposal uses its opening eligibility snapshot."
                    : "X sign-in links your approval to an account you control. Link before a vote opens to participate."}
                </p>
              </div>
              {!me.xLinked &&
                (xReady ? (
                  <a className="btn" href="/api/auth/x/start">
                    Connect X ↗
                  </a>
                ) : (
                  <button disabled className="btn">
                    X connection coming soon
                  </button>
                ))}
            </div>
          </section>
          {!ready && (
            <div className="notice warning" style={{ marginTop: 16 }}>
              Community voting is awaiting the NIKKI token launch. The 24-hour
              rule will apply to each live proposal once voting opens.
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <div className="toolbar">
            <div className="filters">
              {["Open votes", "All decisions"].map((t) => (
                <button
                  key={t}
                  className={"filter " + (filter === t ? "active" : "")}
                  onClick={() => setFilter(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              className="btn btn-small"
              onClick={() => load().catch(() => setError("Unable to refresh."))}
            >
              Refresh ↻
            </button>
          </div>
          {chosen ? (
            <section className="two-col">
              <article>
                <button
                  className="btn btn-small"
                  onClick={() => setActive(null)}
                  style={{ marginBottom: 24 }}
                >
                  ← Back to queue
                </button>
                <div className="player-frame">
                  <div className="panel-title">
                    Private review preview <span>#{chosen.id.slice(-6)}</span>
                  </div>
                  <video
                    key={chosen.id}
                    controls
                    preload="metadata"
                    src={"/api/mod/preview/" + chosen.id}
                  />
                </div>
                <span className={"badge " + chosen.status}>
                  {statusLabel(chosen.status)}
                </span>
                <h2 style={{ marginTop: 20 }}>{chosen.title}</h2>
                <p>{chosen.description}</p>
                <p className="mono muted">
                  By {shortWallet(chosen.creator)} ·{" "}
                  {sizeLabel(chosen.sizeBytes)} · {chosen.category}
                </p>
                <details>
                  <summary className="muted">Record fingerprint</summary>
                  <p className="mono">SHA-256: {chosen.sha256}</p>
                  <p className="mono">
                    Eligibility slot: {chosen.snapshotSlot}
                  </p>
                </details>
              </article>
              <aside className="card">
                <div className="eyebrow accent">
                  {timeLeft(chosen.voteClosesAt, now)}
                </div>
                <h2 style={{ marginTop: 20 }}>Your decision</h2>
                <div className="vote-bar">
                  <span
                    style={{
                      width:
                        chosen.yes + chosen.no
                          ? (chosen.yes / (chosen.yes + chosen.no)) * 100 + "%"
                          : "0%",
                    }}
                  />
                </div>
                <div className="vote-summary">
                  <span>{chosen.yes} approve</span>
                  <span>{chosen.no} decline</span>
                </div>
                <p className="footnote" style={{ marginTop: 16 }}>
                  {chosen.yes + chosen.no} participating wallets · 5 minimum
                </p>
                {chosen.myVote && (
                  <p className="notice">
                    Your current vote:{" "}
                    <strong>
                      {chosen.myVote === "yes" ? "Approve" : "Decline"}
                    </strong>
                    . You can change it before closing.
                  </p>
                )}
                {chosen.canVote && Date.parse(chosen.voteClosesAt) > now ? (
                  <>
                    <label htmlFor="reason">Review note (optional)</label>
                    <textarea
                      id="reason"
                      rows={3}
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain your decision…"
                    />
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={attest}
                        onChange={(e) => setAttest(e.target.checked)}
                      />
                      <span>
                        I have reviewed this video. If published, my wallet, X
                        account ID and username, review note, and signed vote
                        will be permanently public with this record.
                      </span>
                    </label>
                    <div className="btn-row">
                      <button
                        disabled={!attest || busy}
                        className="btn btn-approve"
                        onClick={() => vote("yes")}
                      >
                        {busy ? "Signing…" : "Approve ↗"}
                      </button>
                      <button
                        disabled={!attest || busy}
                        className="btn btn-danger"
                        onClick={() => vote("no")}
                      >
                        Decline
                      </button>
                    </div>
                    <p className="footnote" style={{ marginTop: 24 }}>
                      Signing records a vote. It does not transfer tokens or
                      publish the video immediately.
                    </p>
                  </>
                ) : (
                  <p className="notice">
                    This vote is closed or your wallet was not eligible at
                    opening.
                  </p>
                )}
              </aside>
            </section>
          ) : !visible.length ? (
            <div className="empty-state">
              <div className="empty-symbol">[ ✓ ]</div>
              <h3>No proposals available to review.</h3>
              <p>
                Your queue shows records you submitted and votes where your
                wallet was eligible at opening.
              </p>
            </div>
          ) : (
            <div className="grid">
              {visible.map((v) => (
                <button
                  className="card video-card"
                  style={{ color: "inherit", textAlign: "left" }}
                  key={v.id}
                  onClick={() => {
                    setActive(v.id);
                    setReason("");
                    setAttest(false);
                    setError("");
                    setNotice("");
                  }}
                >
                  <div className="panel-title">
                    <span>{v.category}</span>
                    <span className="accent">↗</span>
                  </div>
                  <div className="meta">
                    <span className={"badge " + v.status}>
                      {statusLabel(v.status)}
                    </span>
                    <h3>{v.title}</h3>
                    <p className="muted">
                      {v.description.slice(0, 140)}
                      {v.description.length > 140 ? "…" : ""}
                    </p>
                    <p className="mono">{timeLeft(v.voteClosesAt, now)}</p>
                    <div className="vote-summary">
                      <span>
                        {v.yes} approve / {v.no} decline
                      </span>
                      <span>{v.yes + v.no}/5 minimum</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
