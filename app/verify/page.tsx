import type { Metadata } from "next";

import VerifyClient from "@/app/components/VerifyClient";

export const metadata: Metadata = {
  title: "Verify Review Receipt — Solidity Quick Review",
  description:
    "Check whether a Solidity Quick Review report hash is anchored onchain as a review receipt on Base."
};

export default async function VerifyPage({
  searchParams
}: {
  searchParams: Promise<{ hash?: string }>;
}) {
  const { hash } = await searchParams;

  return (
    <section className="stack page-container">
      <div className="page-intro stack">
        <h1>Verify a review receipt</h1>
        <p className="muted">
          Every completed review produces a deterministic report hash. Owners can anchor that hash
          onchain as a receipt on Base. Paste a report hash below to independently verify that a
          review existed — no account, no wallet, no report content exposed.
        </p>
      </div>
      <VerifyClient initialHash={hash ?? null} />
    </section>
  );
}
