import Link from "next/link";
export const dynamic = "force-dynamic";
export const metadata = { title: "How Nikki works" };
const images = [
  {
    file: "apollo-11.jpg",
    title: "The things we discover",
    credit: "NASA · Apollo 11, 1969",
    url: "https://science.nasa.gov/resource/apollo-11-buzz-aldrin/",
  },
  {
    file: "mulberry-street.jpg",
    title: "The lives we lead",
    credit: "Library of Congress · New York, c. 1900",
    url: "https://www.loc.gov/pictures/item/2016794146/",
  },
  {
    file: "jellyfish.jpg",
    title: "The world we inherit",
    credit: "NOAA Ocean Exploration · 2019",
    url: "https://oceanexplorer.noaa.gov/multimedia/daily-image-media-20200903/",
  },
];
export default function About() {
  return (
    <main className="container">
      <header className="page-header">
        <div className="eyebrow accent">[ THE IDEA BEHIND NIKKI ]</div>
        <h1>
          A future with
          <br />a memory<span className="accent">.</span>
        </h1>
        <p>
          Human history lives in recordings. Nikki exists to help creators
          preserve them, with a community deciding what enters the archive.
        </p>
      </header>
      {process.env.RELEASE_MODE === "founder" && (
        <div className="notice" style={{ marginBottom: 32 }}>
          Founder release: the creator of Nikki signs and preserves its first
          video. Public submissions and token-holder voting open after the NIKKI
          token launch. The community rules below describe that next phase.
        </div>
      )}
      <div className="collection-grid">
        {images.map((i) => (
          <figure style={{ margin: 0 }} key={i.file}>
            <a
              className="collection"
              style={{ display: "block" }}
              href={i.url}
              target="_blank"
              rel="noreferrer"
            >
              <img src={"/images/" + i.file} alt={i.credit} loading="lazy" />
              <span>{i.title} ↗</span>
            </a>
            <figcaption className="footnote" style={{ marginTop: 12 }}>
              {i.credit}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="footnote" style={{ marginTop: 16 }}>
        Archival photographs shown as inspiration, with links to their original
        sources. They are not Nikki video publications.
      </p>
      <section className="two-col" style={{ marginTop: 48 }}>
        <article>
          <h2>From a recording to a record.</h2>
          <ol className="steps">
            <li>
              <div>
                <strong>Submit</strong>
                <span>
                  Creators upload an MP4 or WebM video up to 1 GB and add its
                  context. No NIKKI holdings are needed to contribute.
                </span>
              </div>
            </li>
            <li>
              <div>
                <strong>Review</strong>
                <span>
                  Wallets holding more than 10 million NIKKI, connected through
                  X before the vote opens, can cast one vote each over 24 hours.
                </span>
              </div>
            </li>
            <li>
              <div>
                <strong>Decide</strong>
                <span>
                  At least five wallets must vote, with at least 80% approving.
                  The result is determined at closing.
                </span>
              </div>
            </li>
            <li>
              <div>
                <strong>Preserve</strong>
                <span>
                  The creator confirms the exact approved record and pays a
                  one-time storage fee in SOL. The video goes live after storage
                  is verified.
                </span>
              </div>
            </li>
          </ol>
          <h2 style={{ marginTop: 40 }}>What preservation means</h2>
          <p>
            Published records have no deletion or delisting controls. Changes to
            an approved submission require a new review.
          </p>
          <p className="muted">
            Permanent storage is designed to preserve copies independently of
            Nikki. It cannot guarantee that this domain or every playback
            gateway will always be available. Each publication includes its file
            fingerprint and independent storage identifier.
          </p>
        </article>
        <aside>
          <div className="card">
            <div className="eyebrow accent">The founding rules</div>
            <div className="rule-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="rule-card">
                <strong>1 billion</strong>
                <span>Planned NIKKI supply on Solana</span>
              </div>
              <div className="rule-card">
                <strong>&gt;10 million</strong>
                <span>Tokens required in a voting wallet</span>
              </div>
              <div className="rule-card">
                <strong>1 wallet · 1 vote</strong>
                <span>Eligibility fixed at each vote’s opening</span>
              </div>
            </div>
            <p className="footnote">
              X sign-in identifies account control, not a unique human or the
              truth of every claim. Approval records a moderator’s personal
              decision.
            </p>
            <p className="footnote">
              The founder controls the operating treasury, which is excluded
              from voting. A separate developer wallet may vote under the same
              eligibility rules.
            </p>
            <Link href="/studio" className="btn btn-primary">
              Contribute a record ↗
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
