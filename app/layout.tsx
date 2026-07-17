import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Inter, Inter_Tight } from "next/font/google";

import "@/app/globals.css";
import WalletButton from "@/app/components/WalletButton";
import MobileNav from "@/app/components/MobileNav";
import { NAV_LINKS } from "@/lib/nav-links";

// Linear-style type: a tight geometric-humanist sans for headings, Inter for
// body, and IBM Plex Mono kept as the accent for labels/code.
const headingFont = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
  weight: ["500", "600", "700"]
});

const bodyFont = Inter({
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
  },
  other: {
    "talentapp:project_verification":
      "ba7c51285ea1fd0dfc40d04461710fb18651df202cc17d86c86e1072b319090ed369b0ea3dd7072d95cea137b82ae6bb28925c5fcd499c6b8cfb9544f1a22530"
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
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <MobileNav />
            <div className="wallet-slot">
              <WalletButton />
            </div>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <div className="footer-items">
              <span className="footer-item">Solidity Quick Review</span>
              <span className="footer-item">Automated screening for snippets and verified Base contracts</span>
              <Link href="/verify" className="footer-item">
                Verify Receipt
              </Link>
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
