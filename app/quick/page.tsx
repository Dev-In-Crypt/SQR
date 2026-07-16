import type { Metadata } from "next";
import Link from "next/link";

import QuickScanForm from "@/app/components/QuickScanForm";

export const metadata: Metadata = {
  title: "Free Quick Scan — Solidity Quick Review",
  description:
    "Free static-only Solidity risk scan — no wallet, no account. Paste code or a verified Base contract address."
};

export default function QuickScanPage() {
  return (
    <section className="stack page-container">
      <div className="page-intro stack">
        <h1>Free quick scan</h1>
        <p className="muted">
          Static-only screening (Slither + compile checks) with no wallet and no account. For the
          full AI-assisted review, deterministic report hash, and optional onchain receipt, run a{" "}
          <Link href="/">full analysis</Link>.
        </p>
      </div>
      <QuickScanForm />
    </section>
  );
}
