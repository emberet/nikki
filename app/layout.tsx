import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Providers from "@/components/Providers";
import SignInButton from "@/components/SignInButton";

export const metadata: Metadata = {
  title: "Nikki — videos that can never be deleted",
  description:
    "Long-form video, human-reviewed, then permanently stored on Arweave. No one — not even the creator — can ever take it down.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav className="nav">
            <Link href="/" className="logo">
              Nik<span>ki</span>
            </Link>
            <div className="links">
              <Link href="/">Watch</Link>
              <Link href="/studio">Upload</Link>
              <Link href="/mod">Mod portal</Link>
            </div>
            <SignInButton />
          </nav>
          {children}
        </Providers>
      </body>
    </html>
  );
}
