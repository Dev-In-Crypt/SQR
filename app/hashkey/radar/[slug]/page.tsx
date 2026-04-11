import Link from "next/link";
import { notFound } from "next/navigation";

import { findHashkeyRadarEntry } from "@/lib/hashkey-radar";

export default async function HashkeyRadarDetailPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const entry = findHashkeyRadarEntry(slug);

  if (!entry) {
    notFound();
  }

  return (
    <section className="stack page-container">
      <div className="card stack">
        <div className="row">
          <h1 style={{ margin: 0 }}>{entry.name}</h1>
          <span className="badge">HashKey Chain</span>
        </div>
        <div className="muted">Contract: {entry.address}</div>
        <p>{entry.riskSummary}</p>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Builder review snapshot</h2>
        <ul>
          {entry.reviewNotes.map((note, index) => (
            <li key={`builder-note-${index}`}>{note}</li>
          ))}
        </ul>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Partner / Investor snapshot</h2>
        <p className="muted">
          Main concern: {entry.recurringConcern} This indicates where manual due diligence should start before deeper
          integration review.
        </p>
        <p className="muted">
          Confidence boundary: this page records triage intelligence only. It does not certify that the contract is
          secure.
        </p>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Top risk categories</h2>
        <ul>
          {entry.topRiskCategories.map((category) => (
            <li key={`category-${category}`}>{category}</li>
          ))}
        </ul>
        <Link href="/hashkey/radar">Back to Risk Radar</Link>
      </div>
    </section>
  );
}
