import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "../public-site/storage-pricing.css";
import Providers from "@/components/Providers";
import SignInButton from "@/components/SignInButton";
export const metadata: Metadata = {
  title: { default: "Nikki — A permanent record", template: "%s — Nikki" },
  description:
    "Preserve human history and knowledge. Long-form video, approved by the community and committed to permanent storage.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <Providers>
          <header className="nav">
            <Link href="/" className="brand" aria-label="Nikki archive">
              <span className="brand-mark" aria-hidden="true">
                N
              </span>
              <span>
                <span className="brand-name">NIKKI</span>
                <span className="brand-caption">THE PERMANENT RECORD</span>
              </span>
            </Link>
            <nav aria-label="Main navigation" className="nav-links">
              <Link href="/">Archive</Link>
              <Link href="/studio">Creator studio</Link>
              <Link href="/mod">Community review</Link>
            </nav>
            <div className="nav-auth">
              <SignInButton />
            </div>
          </header>
          <div className="ticker">
            <span>
              <i className="dot" />
              Human history. Shared knowledge.
            </span>
            <span>Recorded for the future</span>
            <span>Built to outlast us ↗</span>
          </div>
          <div id="content">{children}</div>
          <footer className="footer">
            <span>
              © {new Date().getFullYear()} NIKKI · A RECORD WORTH KEEPING.
            </span>
            <div className="footer-links">
              <Link href="/about">How Nikki works ↗</Link>
              <Link href="/mod">Review the next chapter ↗</Link>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
