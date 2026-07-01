import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Manrope, Space_Grotesk } from "next/font/google";

import "@/app/globals.css";
import WalletButton from "@/app/components/WalletButton";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading"
});

const bodyFont = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  title: "Solidity Quick Review",
  description: "Fast Solidity risk review with deterministic report hash and optional Base receipt",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.ico"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <div className="app-shell">
          <header className="topbar">
            <div className="brand-block">
              <Link href="/" className="brand">
                Solidity Quick Review
              </Link>
              <span className="brand-note">Private review workspace for Solidity risk triage</span>
            </div>
            <nav className="main-nav" aria-label="Primary navigation">
              <Link href="/#analyze">New Analysis</Link>
              <Link href="/#capabilities">Capabilities</Link>
              <Link href="/#faq">FAQ</Link>
              <Link href="/#roadmap">Roadmap</Link>
              <Link href="/history">History</Link>
            </nav>
            <div className="wallet-slot">
              <WalletButton />
            </div>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <div className="footer-items">
              <span className="footer-item">Solidity Quick Review</span>
              <span className="footer-item">Automated screening for snippets and verified Base contracts</span>
              <Link href="/privacy" className="footer-item">
                Privacy
              </Link>
              <Link href="/terms" className="footer-item">
                Terms &amp; Conditions
              </Link>
              <Link href="/history" className="footer-item">
                Report History
              </Link>
              <a href="mailto:sqrsupport@gmail.com" className="footer-item">
                Support
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
