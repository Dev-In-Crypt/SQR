import Link from "next/link";

import { HASHKEY_RADAR_ENTRIES } from "@/lib/hashkey-radar";

export default function HashkeyRiskRadarPage() {
  const recurring = [
    "Privilege-heavy controls require clearer governance paths.",
    "Upgradeable systems need stronger change-management evidence.",
    "Settlement/accounting assumptions need targeted invariant tests."
  ];

  return (
    <section className="stack page-container">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>HashKey Ecosystem Risk Radar</h1>
        <p className="muted">
          Curated screening snapshots for HashKey Chain contracts. This radar is a triage layer for ecosystem visibility,
          not a formal audit registry.
        </p>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Recurring risk patterns</h2>
        <ul>
          {recurring.map((item, index) => (
            <li key={`pattern-${index}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="stack">
        {HASHKEY_RADAR_ENTRIES.map((entry) => (
          <article key={entry.slug} className="card stack">
            <div className="row">
              <h3 style={{ margin: 0 }}>{entry.name}</h3>
              <span className="badge">HashKey Testnet</span>
            </div>
            <div className="muted">{entry.address}</div>
            <p>{entry.riskSummary}</p>
            <div>
              <strong>Top risk categories</strong>
              <ul>
                {entry.topRiskCategories.map((category) => (
                  <li key={`${entry.slug}-${category}`}>{category}</li>
                ))}
              </ul>
            </div>
            <div className="muted">Reviewed at: {new Date(entry.reviewedAt).toLocaleString()}</div>
            <Link href={`/hashkey/radar/${entry.slug}`}>Open detailed review</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
