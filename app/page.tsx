import HomeForm from "@/app/components/HomeForm";

export default function HomePage() {
  return (
    <div className="stack page-stack homepage">
      <section id="analyze" className="anchor-section hero-section">
        <div className="zone zone-hero">
          <div className="zone-inner">
            <div className="hero-surface">
              <div className="hero-grid">
                <div className="stack hero-copy">
                  <h1>Solidity Quick Review</h1>
                  <p className="hero-subheadline">
                    Check Solidity snippets and verified EVM contracts in minutes with AI-assisted static analysis and
                    structured findings you can share when needed.
                  </p>
                  <p className="hero-subheadline hero-subheadline-secondary">
                    Surface potential vulnerabilities and logic issues early, before they reach production.
                  </p>
                </div>
                <div className="hero-analyzer">
                  <HomeForm />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="anchor-section section-zone">
        <div className="zone zone-soft">
          <div className="zone-inner">
            <div className="stack section-card section-frame">
              <h2>How it works</h2>
              <ol className="steps polished-steps">
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Submit Solidity snippets or verified EVM contract addresses.</strong>{" "}
                    The system retrieves the source code for analysis.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">
                      We run multiple static analysis tools to detect vulnerabilities and risky coding patterns before
                      deployment.
                    </strong>
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">
                      AI logic review checks contract behavior and highlights suspicious flows.
                    </strong>{" "}
                    An AI powered review analyzes contract logic and flags unusual or potentially dangerous behavior.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">
                      You receive a structured report with severities, evidence, and guidance.
                    </strong>{" "}
                    The results are returned as a structured report with severity levels and clear explanations.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Optionally mint an onchain receipt so you can prove what was reviewed.</strong>{" "}
                    You can optionally mint an onchain receipt to record what code was analyzed and when.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="anchor-section section-zone">
        <div className="zone zone-deep">
          <div className="zone-inner">
            <div className="stack section-card section-card-contrast">
              <h2>Features</h2>
              <div className="features-grid">
                <article className="info-block stack">
                  <h3>Solidity developers</h3>
                  <p className="muted">
                    Run fast pre-deployment checks on snippets and prototypes, with findings grouped by severity so you
                    can fix the riskiest issues first.
                  </p>
                </article>
                <article className="info-block stack">
                  <h3>EVM builders and teams</h3>
                  <p className="muted">
                    Review verified EVM contracts before deeper manual audits, integrations, or launches, and keep a
                    record of what was checked.
                  </p>
                </article>
                <article className="info-block stack">
                  <h3>Projects and users</h3>
                  <p className="muted">
                    Add an extra automated review step before you trust or integrate a contract, and share the report
                    with stakeholders in a readable format.
                  </p>
                </article>
                <article className="info-block stack">
                  <h3>Deterministic and shareable output</h3>
                  <p className="muted">
                    Use deterministic report hashes and optional onchain receipts to show which code was scanned and
                    which findings were produced at that time.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="anchor-section section-zone">
        <div className="zone zone-faq">
          <div className="zone-inner">
            <div className="stack section-card section-frame">
              <h2>FAQ</h2>
              <div className="stack faq-list">
                <details className="faq-item">
                  <summary>Who is this for?</summary>
                  <p className="muted">
                    Solidity developers, EVM builders, product teams, and users who need a fast review checkpoint.
                    It fits early validation before deployment, integration, or deeper manual review.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>What is this useful for?</summary>
                  <p className="muted">
                    Use it for quick contract checks, spotting suspicious logic, and producing structured findings.
                    You can also share output privately and anchor report hashes with an optional onchain receipt.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>Is this a full smart contract audit?</summary>
                  <p className="muted">
                    No. This is an automated review layer for fast risk screening and documentation.
                    It is useful before a full manual audit, not a replacement for one.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>What is an AI audit?</summary>
                  <p className="muted">
                    It is an AI logic review that flags risk patterns and contract behavior worth checking.
                    Findings are intended for reviewer verification, not treated as guaranteed conclusions.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>What is a report hash?</summary>
                  <p className="muted">
                    A deterministic report hash is a stable fingerprint of the report output.
                    It helps with integrity checks, reference sharing, and receipt anchoring.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>What is an onchain receipt?</summary>
                  <p className="muted">
                    It is an optional EVM transaction on the selected receipt network that timestamps a signed report hash.
                    This provides onchain proof that a specific report output existed at that time.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>Are reports public by default?</summary>
                  <p className="muted">
                    No. Reports are private by default and visible to owner context unless shared.
                    Owners can publish a report or generate a private link when needed.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>What can I analyze?</summary>
                  <p className="muted">
                    You can paste Solidity snippets or submit verified EVM contract addresses.
                    The platform is designed for practical automated review on these input types.
                  </p>
                </details>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="roadmap" className="anchor-section section-zone">
        <div className="zone zone-roadmap">
          <div className="zone-inner">
            <div className="stack section-card section-frame">
              <h2>Roadmap</h2>
              <div className="roadmap-timeline" role="list">
                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">01</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title roadmap-title-nowrap">Deeper static analysis coverage</h3>
                    <p className="muted roadmap-description roadmap-description-nowrap">
                      Expand detection for more advanced vulnerability classes and complex contract logic paths.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">02</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title roadmap-title-nowrap">Cross chain contract support</h3>
                    <p className="muted roadmap-description roadmap-description-nowrap">
                      Expand analysis coverage for contracts deployed across additional EVM networks.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">03</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Richer report explanations</h3>
                    <p className="muted roadmap-description">
                      Provide clearer risk context, examples, and follow up guidance for each finding.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">04</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Public shareable reports</h3>
                    <p className="muted roadmap-description">
                      Generate secure links so reports can be shared with teams, auditors, or stakeholders.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">05</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">GitHub and CI integration</h3>
                    <p className="muted roadmap-description">
                      Enable automated contract checks directly from repositories and CI pipelines.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">06</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Batch contract analysis</h3>
                    <p className="muted roadmap-description">
                      Allow scanning multiple contracts or entire repositories in a single workflow.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">07</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Gas optimization insights</h3>
                    <p className="muted roadmap-description">
                      Highlight inefficient patterns and suggest potential gas optimizations.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">08</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Expanded contract input support</h3>
                    <p className="muted roadmap-description">
                      Support more verified source formats and complex multi file contract structures.
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
