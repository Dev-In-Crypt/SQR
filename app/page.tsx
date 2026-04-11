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
                    Fast Solidity risk triage for snippets and verified contracts, with Base support and a focused
                    HashKey Chain hackathon extension for financial contract review.
                  </p>
                  <p className="hero-subheadline hero-subheadline-secondary">
                    Use this for screening, structured review handoff, and trust signaling. It is not a full audit and
                    does not provide security certification.
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
                    <strong className="how-step-lead">Choose snippet or verified-address input and select a supported network.</strong>{" "}
                    Solidity Quick Review supports Base and HashKey workflows.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Run static analysis and structured AI-assisted review.</strong> The
                    pipeline prioritizes practical risk triage and clear remediation direction.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Use DeFi / PayFi Review Mode for HashKey financial contract screening.</strong>{" "}
                    Output emphasizes privilege, upgradeability, oracle dependency, fund flow, and settlement risk.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Review Builder and Partner views from the same core report.</strong>{" "}
                    Technical and executive audiences see consistent conclusions with different depth.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Optionally mint an onchain receipt to anchor proof of review.</strong>{" "}
                    The receipt proves report artifact existence, not contract safety.
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
                  <h3>Base and HashKey teams</h3>
                  <p className="muted">
                    Run verified-contract checks before deeper manual audits, integrations, or launches, then keep a
                    clear record of what was reviewed.
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
                    Solidity teams, Base builders, HashKey builders, and integration partners who need fast risk triage.
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
                    It is an optional onchain transaction (Base-compatible / HashKey demo flow) that timestamps a
                    signed report hash.
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
                    You can paste Solidity snippets or submit verified contract addresses on supported networks,
                    including Base and HashKey Chain.
                    The platform is designed for practical automated review on these input types.
                  </p>
                </details>
                <details className="faq-item">
                  <summary>Is HashKey a separate product?</summary>
                  <p className="muted">
                    No. Solidity Quick Review is the core product. HashKey Chain Financial Contract Risk Review is a
                    focused hackathon extension built on top of it.
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
                    <h3 className="roadmap-title roadmap-title-nowrap">Working now: Base + HashKey support</h3>
                    <p className="muted roadmap-description roadmap-description-nowrap">
                      Snippet and verified-address analysis are live with Base support and HashKey testnet demo flow.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">02</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title roadmap-title-nowrap">Hackathon MVP: DeFi / PayFi review mode</h3>
                    <p className="muted roadmap-description roadmap-description-nowrap">
                      Financial risk framing and audience-specific report views are available for HashKey workflows.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">03</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Hackathon MVP: HashKey Risk Radar</h3>
                    <p className="muted roadmap-description">
                      Curated HashKey contract entries provide ecosystem-level triage visibility with links to details.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">04</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Next: richer protocol context in reports</h3>
                    <p className="muted roadmap-description">
                      Add deeper fund-flow mapping and clearer evidence trails for complex protocol architectures.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">05</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Next: stronger CI and repository integrations</h3>
                    <p className="muted roadmap-description">
                      Expand automation hooks so teams can enforce triage checks in pull requests and release gates.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">06</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Next: scaled batch and monitoring workflows</h3>
                    <p className="muted roadmap-description">
                      Support larger contract sets and recurring screening workflows without changing core product scope.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">07</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Next: HashKey mainnet readiness validation</h3>
                    <p className="muted roadmap-description">
                      Finalize wallet, RPC, and explorer verification checks before default HashKey mainnet rollout.
                    </p>
                  </div>
                </article>

                <article className="roadmap-item" role="listitem">
                  <div className="roadmap-rail" aria-hidden="true">
                    <span className="roadmap-index">08</span>
                    <span className="roadmap-connector" />
                  </div>
                  <div className="roadmap-panel">
                    <h3 className="roadmap-title">Future: ecosystem trust signal integrations</h3>
                    <p className="muted roadmap-description">
                      Explore optional integration with broader ecosystem trust metadata while keeping triage focus.
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
