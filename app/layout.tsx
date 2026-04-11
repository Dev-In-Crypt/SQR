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
  description:
    "Automated Solidity risk triage for snippets and verified contracts, with Base support and a HashKey Chain hackathon extension for financial contract review.",
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
            <Link href="/" className="brand">
              Solidity Quick Review
            </Link>
            <nav className="main-nav">
              <Link href="/#analyze">Analyze</Link>
              <Link href="/hashkey/radar">Risk Radar</Link>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#features">Features</Link>
              <Link href="/#faq">FAQ</Link>
              <Link href="/#roadmap">Roadmap</Link>
            </nav>
            <div className="wallet-slot">
              <WalletButton />
            </div>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <div className="footer-items">
              <span className="footer-item">SOLIDITY QUICK REVIEW</span>
              <span className="footer-item">&copy; 2026 All rights reserved</span>
              <Link href="/privacy" className="footer-item">
                Privacy
              </Link>
              <Link href="/terms" className="footer-item">
                Terms &amp; Conditions
              </Link>
              <a href="mailto:sqrsupport@gmail.com" className="footer-item">
                Support: sqrsupport@gmail.com
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
