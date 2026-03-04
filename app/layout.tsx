import type { Metadata } from "next";
import Link from "next/link";

import "@/app/globals.css";

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
            <div className="brand">Solidity Quick Review</div>
            <nav className="main-nav">
              <Link href="/">Analyze</Link>
              <Link href="/history">History</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
