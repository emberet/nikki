"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import SignInButton, { useAuth } from "@/components/SignInButton";
import StoragePricingBar from "@/components/StoragePricingBar";
import { post, sizeLabel, timeLeft } from "@/lib/client";
import { CHUNK_BYTES, MAX_UPLOAD_BYTES, statusLabel } from "@/lib/rules";
type Submission = {
  id: string;
  title: string;
  status: string;
  sizeBytes: string;
  sha256: string | null;
  arweaveTx: string | null;
  voteClosesAt: string | null;
  yes: number;
  no: number;
  publicationError: string | null;
  paymentSignature?: string | null;
};
type Quote = {
  videoId: string;
  quoteLamports: string;
  recipient: string;
  reference: string;
  expiresAt: string;
  sha256: string;
};
export default function Studio() {
  const { me, loaded } = useAuth(),
    { publicKey, sendTransaction, signMessage } = useWallet(),
    { connection } = useConnection();
  const [launch, setLaunch] = useState<{
    releaseMode: string;
    founderWallet: string | null;
    uploadsEnabled: boolean;
  }>({ releaseMode: "local", founderWallet: null, uploadsEnabled: false });
  const canUpload =
    launch.uploadsEnabled &&
    (launch.releaseMode !== "founder" || me?.wallet === launch.founderWallet);
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState("Knowledge"),
    [language, setLanguage] = useState("English"),
    [recordedAt, setRecordedAt] = useState(""),
    [source, setSource] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const [mine, setMine] = useState<Submission[]>([]),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [signature, setSignature] = useState(""),
    [uploadId, setUploadId] = useState<string | null>(null),
    [votingReady, setVotingReady] = useState(false);
  const load = useCallback(async () => {
    if (!me) return;
    try {
      const r = await fetch("/api/my-videos");
      if (!r.ok) throw Error("Your submissions could not be loaded.");
      setMine(await r.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me]);
  useEffect(() => {
    load();
    if (!me) return;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [me, load]);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setVotingReady(c.votingConfigured);
        setLaunch(c);
      })
      .catch(() => {});
  }, []);
  const action = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      setBusy("");
    }
  };
  const upload = () =>
    action("upload", async () => {
      if (!canUpload)
        throw Error("Submissions are not open for this wallet yet.");
      if (!file || !title.trim())
        throw Error("Add a title and select a video.");
      if (file.size > MAX_UPLOAD_BYTES)
        throw Error("The maximum video size is 1 GB.");
      let videoId = uploadId;
      if (!videoId) {
        const created = await post("/api/upload/init", {
          title,
          description,
          category,
          language,
          recordedAt,
          source,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        videoId = created.videoId;
        setUploadId(videoId);
      }
      let offset = 0,
        retries = 0;
      while (offset < file.size) {
        const piece = file.slice(offset, offset + CHUNK_BYTES);
        const r = await fetch(
          "/api/upload/chunk?videoId=" + videoId + "&offset=" + offset,
          { method: "POST", body: piece },
        );
        const result = await r.json();
        if (
          r.status === 409 &&
          Number.isSafeInteger(result.expected) &&
          result.expected >= 0 &&
          result.expected <= file.size &&
          retries++ < 5
        ) {
          offset = result.expected;
          continue;
        }
        if (!r.ok)
          throw Error(
            result.error || "Upload interrupted. Try again to resume.",
          );
        offset = result.received;
        setProgress(Math.round((offset / file.size) * 100));
      }
      await post("/api/upload/complete", { videoId });
      setUploadId(null);
      setFile(null);
      setTitle("");
      setDescription("");
      setSource("");
      setProgress(0);
      if (votingReady) {
        await post("/api/voting/open", { videoId });
        setNotice(
          "Your 24-hour community vote is open. No payment is due yet.",
        );
      } else if (launch.releaseMode === "founder")
        setNotice(
          "Your creator drop is uploaded. Sign its publication below once permanent storage is configured.",
        );
      else
        setNotice(
          "Your video is received. It is held privately for up to seven days while community voting is unavailable. No payment is due.",
        );
    });
  const publishFounding = (video: Submission) =>
    action(video.id, async () => {
      if (!signMessage || publicKey?.toBase58() !== me?.wallet)
        throw Error("Connect the founder wallet to confirm this publication.");
      const confirmation = await post("/api/founder/message", {
        videoId: video.id,
      });
      const signed = bs58.encode(
        await signMessage(new TextEncoder().encode(confirmation.message)),
      );
      await post("/api/founder/publish", {
        videoId: video.id,
        signature: signed,
        issuedAt: confirmation.issuedAt,
        confirmPermanent: true,
      });
      setNotice(
        "Your signed creator drop is queued for preservation. The project’s prepaid storage credits cover this publication.",
      );
    });
  const requestQuote = (v: Submission) =>
    action(v.id, async () => {
      const next = await post("/api/pay/quote", { videoId: v.id });
      setQuote(next);
      setConfirmed(false);
      setSignature(
        localStorage.getItem("nikki:payment:" + me?.wallet + ":" + v.id) || "",
      );
    });
  const pay = () =>
    action("pay", async () => {
      if (!quote || !confirmed)
        throw Error("Confirm that you want to preserve this exact video.");
      if (!publicKey || publicKey.toBase58() !== me?.wallet)
        throw Error("Connect the same wallet you used to submit this video.");
      let sig = signature;
      if (!sig) {
        if (Date.parse(quote.expiresAt) <= Date.now())
          throw Error(
            "This price has expired. Close the payment panel and request a new quote.",
          );
        const block = await connection.getLatestBlockhash("finalized");
        const tx = new Transaction({ feePayer: publicKey, ...block }).add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(quote.recipient),
            lamports: Number(quote.quoteLamports),
          }),
          new TransactionInstruction({
            programId: new PublicKey(
              "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
            ),
            keys: [],
            data: Buffer.from(quote.reference),
          }),
        );
        sig = await sendTransaction(tx, connection);
        setSignature(sig);
        localStorage.setItem(
          "nikki:payment:" + me?.wallet + ":" + quote.videoId,
          sig,
        );
        const confirmation = await connection.confirmTransaction(
          { signature: sig, ...block },
          "finalized",
        );
        if (confirmation.value.err)
          throw Error(
            "The payment transaction failed. Review its result before trying again.",
          );
      }
      await post("/api/pay", {
        videoId: quote.videoId,
        signature: sig,
        currency: "SOL",
        confirmPermanent: true,
      });
      localStorage.removeItem(
        "nikki:payment:" + me?.wallet + ":" + quote.videoId,
      );
      setNotice(
        "Payment recorded. You can now start preservation without another payment.",
      );
      setQuote(null);
      setSignature("");
    });
  return (
    <main className="container">
      <header className="page-header">
        <span className="eyebrow accent">[ 02 — CREATOR STUDIO ]</span>
        <h1>
          Leave a record<span className="accent">.</span>
        </h1>
        <p>
          Give a story, an idea, or a discovery a place in the permanent
          archive.
        </p>
      </header>
      {!loaded ? (
        <div className="loading">Loading your studio…</div>
      ) : !me ? (
        <>
          <div className="two-col">
            <div className="signin-panel" style={{ margin: 0, width: "100%" }}>
              <div className="empty-symbol">[ ↗ ]</div>
              <h2>Your work. A lasting record.</h2>
              <p>
                {launch.releaseMode === "founder"
                  ? "Connect the configured founder wallet to prepare a Nikki creator drop."
                  : "Connect a Solana wallet to submit a video and track its community review. Holding NIKKI is required only for voting."}
              </p>
              <SignInButton />
              <p
                className="footnote"
                style={{ marginTop: 24, marginBottom: 0 }}
              >
                {launch.releaseMode === "founder"
                  ? "Founder release · Public submissions open after the token launch."
                  : "No payment until your video is approved."}
              </p>
            </div>
            <Process founder={launch.releaseMode === "founder"} />
          </div>
          <div className="rule-grid">
            <div className="rule-card">
              <strong>1 GB</strong>
              <span>Maximum video size</span>
            </div>
            <div className="rule-card">
              <strong>
                {launch.releaseMode === "founder" ? "Signed" : "24h"}
              </strong>
              <span>
                {launch.releaseMode === "founder"
                  ? "Founder approval"
                  : "Community review"}
              </span>
            </div>
            <div className="rule-card">
              <strong>
                {launch.releaseMode === "founder" ? "Prepaid" : "SOL"}
              </strong>
              <span>
                {launch.releaseMode === "founder"
                  ? "Project-funded storage"
                  : "One-time storage payment"}
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          {launch.releaseMode === "founder" && (
            <div className="notice" style={{ marginBottom: 24 }}>
              This release preserves approved founder drops. Community voting
              and public submissions open after the NIKKI token launch.{" "}
              {canUpload
                ? "Your founder wallet has upload access."
                : "This wallet has no upload access yet."}
            </div>
          )}
          <div className="two-col">
            <section className="card">
              <div className="eyebrow accent">
                01 / Prepare your contribution
              </div>
              <label htmlFor="title">Title</label>
              <input
                id="title"
                type="text"
                placeholder="What should future generations remember?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                disabled={!!uploadId || !!busy}
              />
              <label htmlFor="description">Description & context</label>
              <textarea
                id="description"
                rows={4}
                placeholder="Tell the story behind this recording."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                disabled={!!uploadId || !!busy}
              />
              <div
                className="rule-grid"
                style={{ gridTemplateColumns: "1fr 1fr" }}
              >
                <div>
                  <label htmlFor="category">Collection</label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={!!uploadId || !!busy}
                  >
                    {["History", "Knowledge", "Culture"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="language">Language</label>
                  <input
                    id="language"
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    maxLength={60}
                    disabled={!!uploadId || !!busy}
                  />
                </div>
              </div>
              <label htmlFor="recorded">Recording date (optional)</label>
              <input
                id="recorded"
                type="date"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                disabled={!!uploadId || !!busy}
              />
              <label htmlFor="source">Source or attribution (optional)</label>
              <input
                id="source"
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={500}
                placeholder="Who made this recording? Where did it come from?"
                disabled={!!uploadId || !!busy}
              />
              <label htmlFor="video">Video file</label>
              <div className="dropzone">
                <strong>Choose a record worth keeping</strong>
                <p className="muted" style={{ fontSize: ".875rem" }}>
                  MP4 or WebM · up to 1 GB
                </p>
                <input
                  id="video"
                  type="file"
                  accept="video/mp4,video/webm"
                  disabled={!!busy || !!uploadId}
                  onChange={(e) => {
                    const selected = e.target.files?.[0] || null;
                    setError("");
                    if (selected && selected.size > MAX_UPLOAD_BYTES) {
                      setError("That file exceeds the 1 GB limit.");
                      e.target.value = "";
                      setFile(null);
                    } else setFile(selected);
                  }}
                />
                {file && (
                  <p
                    className="mono"
                    style={{ marginTop: 16, marginBottom: 0 }}
                  >
                    {sizeLabel(file.size)}
                  </p>
                )}
              </div>
              {busy === "upload" && (
                <>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Upload progress"
                  >
                    <div style={{ width: progress + "%" }} />
                  </div>
                  <p className="mono muted">{progress}% uploaded</p>
                </>
              )}
              <StoragePricingBar
                bytes={file?.size}
                founder={launch.releaseMode === "founder"}
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: 24 }}
                onClick={upload}
                disabled={!!busy || !title.trim() || !file || !canUpload}
              >
                {busy === "upload"
                  ? "Uploading…"
                  : uploadId
                    ? "Resume upload →"
                    : launch.releaseMode === "founder"
                      ? "Upload founding video ↗"
                      : "Submit for review ↗"}
              </button>
              <p
                className="footnote"
                style={{ marginTop: 20, marginBottom: 0 }}
              >
                {launch.releaseMode === "founder" ? (
                  <>
                    Your file is held privately pending your founder signature
                    and permanent-storage verification. Incomplete uploads
                    expire after 24 hours; unsigned submissions expire after
                    seven days. The project’s prepaid storage credits cover this
                    founding record.
                  </>
                ) : (
                  <>
                    Your file stays private until voting, payment, and
                    preservation are complete. Incomplete uploads expire after
                    24 hours. Submissions awaiting voting expire after seven
                    days. After a vote closes, unpaid submissions without a
                    quote are held for another seven days.
                  </>
                )}
              </p>
            </section>
            <aside>
              <Process founder={launch.releaseMode === "founder"} />
              {!votingReady && launch.releaseMode !== "founder" && (
                <div className="notice warning" style={{ marginTop: 24 }}>
                  The NIKKI token is planned. You can prepare a submission; live
                  voting will open when token eligibility and moderator sign-in
                  are ready.
                </div>
              )}
            </aside>
          </div>
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
          {quote && (
            <section
              className="card"
              style={{ marginTop: 32 }}
              aria-labelledby="payment-title"
            >
              <div className="eyebrow accent">Approved / Final commitment</div>
              <h2 id="payment-title" style={{ marginTop: 20 }}>
                Preserve this record
              </h2>
              <p>
                <strong style={{ fontSize: "1.8rem" }}>
                  {(Number(quote.quoteLamports) / 1e9).toFixed(6)} SOL
                </strong>{" "}
                <span className="muted">+ Solana network fee</span>
              </p>
              <p className="mono muted">File SHA-256: {quote.sha256}</p>
              <p>
                Storage via Turbo on Arweave. Nikki’s platform fee:{" "}
                <strong>0 SOL</strong>. Your SOL goes to the operational wallet
                below to cover storage credits; Solana’s network fee is
                separate.
              </p>
              <p className="mono" style={{ overflowWrap: "anywhere" }}>
                Payment recipient: {quote.recipient}
              </p>
              <p className="footnote">
                Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}.
                Your wallet will show the operational payment recipient.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  I confirm publication of this approved video to permanent
                  storage. I understand that Nikki provides no deletion or
                  delisting after publication.
                </span>
              </label>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={pay}
                  disabled={!!busy || !confirmed}
                >
                  {busy === "pay"
                    ? "Checking payment…"
                    : signature
                      ? "Verify this payment"
                      : "Confirm & pay in SOL ↗"}
                </button>
                <button
                  className="btn"
                  onClick={() => setQuote(null)}
                  disabled={!!busy}
                >
                  Close
                </button>
              </div>
              <details style={{ marginTop: 24 }} open={!!signature}>
                <summary>Already paid? Recover a payment</summary>
                <p className="footnote">
                  Paste your transaction signature to verify the same payment.
                  Do not pay again.
                </p>
                <label htmlFor="signature">Transaction signature</label>
                <input
                  id="signature"
                  type="text"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value.trim())}
                />
              </details>
            </section>
          )}
          <section style={{ marginTop: 48 }}>
            <div className="section-heading">
              <h2>Your contributions</h2>
              <button className="btn btn-small" onClick={load}>
                Refresh ↻
              </button>
            </div>
            {!mine.length ? (
              <div className="empty-state">
                <h3>Your first contribution starts here.</h3>
                <p>Upload a video to follow its journey into the archive.</p>
              </div>
            ) : (
              mine.map((v) => (
                <article className="submission" key={v.id}>
                  <div className="submission-head">
                    <div>
                      <h3>{v.title}</h3>
                      <p className="mono muted">
                        {sizeLabel(v.sizeBytes)}
                        {v.voteClosesAt ? " · " + timeLeft(v.voteClosesAt) : ""}
                      </p>
                    </div>
                    <span className={"badge " + v.status}>
                      {launch.releaseMode === "founder" &&
                      v.status === "snapshot_pending"
                        ? "Ready for founder signature"
                        : statusLabel(v.status)}
                    </span>
                  </div>
                  {v.voteClosesAt && (
                    <p className="vote-summary">
                      <span>
                        {v.yes} approve / {v.no} decline
                      </span>
                      <span>{v.yes + v.no} of 5 minimum votes</span>
                    </p>
                  )}
                  <div className="btn-row">
                    {v.status === "snapshot_pending" &&
                      launch.releaseMode !== "founder" && (
                        <button
                          className="btn"
                          disabled={!!busy || !votingReady}
                          onClick={() =>
                            action(v.id, async () => {
                              await post("/api/voting/open", { videoId: v.id });
                              setNotice(
                                "Your community vote is open for 24 hours.",
                              );
                            })
                          }
                        >
                          {votingReady
                            ? "Open community vote →"
                            : "Waiting for voting launch"}
                        </button>
                      )}
                    {v.status === "snapshot_pending" &&
                      launch.releaseMode === "founder" &&
                      canUpload && (
                        <button
                          className="btn btn-primary"
                          disabled={!!busy}
                          onClick={() => publishFounding(v)}
                        >
                          Sign & preserve creator drop ↗
                        </button>
                      )}
                    {v.status === "approved" &&
                      launch.releaseMode !== "founder" && (
                        <button
                          className="btn btn-primary"
                          disabled={!!busy}
                          onClick={() => requestQuote(v)}
                        >
                          Review storage fee ↗
                        </button>
                      )}
                    {v.status === "payment_received" && (
                      <button
                        className="btn btn-primary"
                        disabled={!!busy}
                        onClick={() =>
                          action(v.id, async () => {
                            await post("/api/publish", { videoId: v.id });
                            setNotice(
                              "Preservation started. Your receipt is being confirmed.",
                            );
                          })
                        }
                      >
                        Start preservation →
                      </button>
                    )}
                    {["publishing", "publish_queued"].includes(v.status) && (
                      <button
                        className="btn"
                        disabled={!!busy}
                        onClick={() =>
                          action(v.id, async () => {
                            const r = await post("/api/publish/verify", {
                              videoId: v.id,
                            });
                            setNotice(
                              r.status === "published"
                                ? "Your record is preserved and live."
                                : r.message ||
                                    "Waiting for storage confirmation.",
                            );
                          })
                        }
                      >
                        Check storage confirmation ↻
                      </button>
                    )}
                    {v.status === "published" && v.arweaveTx && (
                      <Link className="btn" href={"/watch/" + v.arweaveTx}>
                        Watch record ↗
                      </Link>
                    )}
                  </div>
                  {v.status === "approved" &&
                    launch.releaseMode !== "founder" && (
                      <RecoverPayment
                        videoId={v.id}
                        wallet={me.wallet}
                        busy={!!busy}
                        onRecover={(sig) =>
                          action(v.id, async () => {
                            await post("/api/pay", {
                              videoId: v.id,
                              signature: sig,
                              currency: "SOL",
                              confirmPermanent: true,
                            });
                            localStorage.removeItem(
                              "nikki:payment:" + me.wallet + ":" + v.id,
                            );
                            setNotice(
                              "Payment recovered. You do not need to pay again.",
                            );
                            setQuote(null);
                          })
                        }
                      />
                    )}
                  <p>
                    {v.paymentSignature && (
                      <a
                        className="footnote"
                        href={
                          "https://explorer.solana.com/tx/" + v.paymentSignature
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        View recorded SOL payment ↗
                      </a>
                    )}
                  </p>
                  {v.status === "expired_upload" && (
                    <p className="muted">
                      Your temporary file expired. You can submit it again when
                      you are ready.
                    </p>
                  )}
                  {v.publicationError && (
                    <p className="error">{v.publicationError}</p>
                  )}
                  {v.status === "expired" && (
                    <p className="muted">
                      The vote closed without five participating wallets.
                      Nothing was published or charged.
                    </p>
                  )}
                  {v.status === "rejected" && (
                    <p className="muted">
                      This submission did not reach 80% approval. Nothing was
                      published or charged.
                    </p>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
function Process({ founder = false }: { founder?: boolean }) {
  if (founder)
    return (
      <section className="card">
        <div className="eyebrow">The founding record</div>
        <ol className="steps">
          <li>
            <div>
              <strong>Upload the first video</strong>
              <span>
                Use the configured founder wallet and add the recording’s
                context.
              </span>
            </div>
          </li>
          <li>
            <div>
              <strong>Sign the publication</strong>
              <span>
                Confirm this exact record for permanent public storage.
              </span>
            </div>
          </li>
          <li>
            <div>
              <strong>Preserve and verify</strong>
              <span>
                The project’s prepaid storage credits cover the video and signed
                record. It appears publicly after verification.
              </span>
            </div>
          </li>
        </ol>
      </section>
    );
  return (
    <section className="card">
      <div className="eyebrow">From your hands to history</div>
      <ol className="steps">
        <li>
          <div>
            <strong>Submit a video</strong>
            <span>Add the recording and its context.</span>
          </div>
        </li>
        <li>
          <div>
            <strong>Let the community review</strong>
            <span>24 hours. At least 5 voters. 80% approval.</span>
          </div>
        </li>
        <li>
          <div>
            <strong>Make the commitment</strong>
            <span>After approval, confirm and pay once in SOL.</span>
          </div>
        </li>
        <li>
          <div>
            <strong>Enter the archive</strong>
            <span>Live after permanent storage is verified.</span>
          </div>
        </li>
      </ol>
    </section>
  );
}

function RecoverPayment({
  videoId,
  wallet,
  busy,
  onRecover,
}: {
  videoId: string;
  wallet: string;
  busy: boolean;
  onRecover: (signature: string) => void;
}) {
  const [sig, setSig] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setSig(
      localStorage.getItem("nikki:payment:" + wallet + ":" + videoId) || "",
    );
  }, [videoId, wallet]);
  return (
    <details style={{ marginTop: 20 }}>
      <summary>Already paid? Recover your payment</summary>
      <p className="footnote">
        Verify your existing transaction, including an earlier quote. This never
        sends another payment.
      </p>
      <label htmlFor={"recover-" + videoId}>Transaction signature</label>
      <input
        id={"recover-" + videoId}
        type="text"
        value={sig}
        onChange={(e) => setSig(e.target.value.trim())}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I confirm permanent publication of this approved record, with no
          deletion or delisting.
        </span>
      </label>
      <button
        className="btn"
        disabled={busy || !sig || !confirmed}
        onClick={() => onRecover(sig)}
      >
        Verify existing payment ↻
      </button>
    </details>
  );
}
