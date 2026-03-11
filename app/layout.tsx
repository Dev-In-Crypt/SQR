import type { Metadata } from "next";
import Link from "next/link";

import "@/app/globals.css";
import WalletButton from "@/app/components/WalletButton";

export const metadata: Metadata = {
  title: "Solidity Quick Review",
  description: "Fast Solidity risk review with deterministic report hash and optional Base receipt"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link href="/" className="brand">
              Solidity Quick Review
            </Link>
            <nav className="main-nav">
              <Link href="/#analyze">Analyze</Link>
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
            <span>Solidity Quick Review</span>
            <div className="row">
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <a href="mailto:sqrsupport@gmail.com">Support: sqrsupport@gmail.com</a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
