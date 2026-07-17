import HomeForm from "@/app/components/HomeForm";

const capabilities = [
  {
    title: "Input coverage",
    body: "Review Solidity snippets or verified Base contract addresses without changing the underlying submission flow."
  },
  {
    title: "Static review",
    body: "Run deterministic tool-assisted analysis to catch common implementation risks, unsafe patterns, and structural issues early."
  },
  {
    title: "AI logic review",
    body: "Layer AI-assisted reasoning on top of static outputs to surface logic concerns that deserve manual confirmation."
  },
  {
    title: "Structured findings",
    body: "Turn the result into a readable memo with severity, evidence, remediation direction, and review constraints."
  },
  {
    title: "Sharing controls",
    body: "Keep reports private by default, publish when needed, or generate a controlled private link for external review."
  },
  {
    title: "Onchain provenance",
    body: "Optionally mint a Base receipt to anchor report provenance without turning the report into a security guarantee."
  }
] as const;

const pinnedTruths = [
  {
    question: "Not a full audit",
    answer: "This product is an automated review layer for fast risk screening. It is useful before deeper manual review, not a replacement for it."
  },
  {
    question: "Private by default",
    answer: "Reports remain private unless the owner explicitly changes visibility or creates a share link."
  },
  {
    question: "Receipt proves provenance",
    answer: "The optional Base receipt proves that a specific report hash existed at a point in time. It does not certify the contract as secure."
  }
] as const;

const roadmapGroups = [
  {
    title: "Shipped",
    items: [
      "Private reports with owner-scoped access control",
      "Public and private visibility controls",
      "Private share links for controlled external review",
      "Deterministic report hashes and optional Base receipts",
      "Snippet and verified Base contract analysis"
    ]
  },
  {
    title: "In Progress",
    items: [
      "Deeper static-analysis coverage across more vulnerability classes",
      "Richer remediation guidance and clearer report explanation layers",
      "More resilient verified-source handling for complex contract structures"
    ]
  },
  {
    title: "Next",
    items: [
      "GitHub and CI-triggered review workflows",
      "Batch analysis for multiple contracts in one session",
      "Gas optimization insights alongside security findings"
    ]
  },
  {
    title: "Exploration",
    items: [
      "Multi-chain expansion beyond the current Base-focused production workflow",
      "Repository-level review surfaces",
      "Team review and collaboration workflows"
    ]
  }
] as const;

export default function HomePage() {
  return (
    <div className="stack page-stack homepage">
      <section id="analyze" className="anchor-section hero-section">
        <div className="zone zone-hero">
          <div className="zone-inner">
            <div className="hero-surface">
              <div className="hero-grid">
                <div className="stack hero-copy">
                  <div className="section-eyebrow">Confidential Solidity Review Workspace</div>
                  <h1>Premium risk triage for Solidity code before it reaches production.</h1>
                  <p className="hero-subheadline">
                    Review snippets and verified Base contracts through a private, structured workflow that combines
                    static analysis, AI-assisted logic review, and shareable evidence.
                  </p>
                  <div className="trust-strip" role="list" aria-label="Core product guarantees">
                    <span className="trust-chip" role="listitem">Private by default</span>
                    <span className="trust-chip" role="listitem">Static + AI review</span>
                    <span className="trust-chip" role="listitem">Deterministic report hash</span>
                    <span className="trust-chip" role="listitem">Optional Base receipt</span>
                  </div>
                  <div className="hero-memo-preview report-preview" aria-hidden="true">
                    <div className="report-preview-head">
                      <span className="memo-kicker">Review memo</span>
                      <span className="report-preview-status">Done with warnings</span>
                    </div>
                    <ul className="report-preview-list">
                      <li>
                        <span className="badge HIGH">High</span>
                        <span className="report-preview-finding">Reentrancy in withdraw()</span>
                      </li>
                      <li>
                        <span className="badge MEDIUM">Med</span>
                        <span className="report-preview-finding">Unchecked low-level call return</span>
                      </li>
                      <li>
                        <span className="badge LOW">Low</span>
                        <span className="report-preview-finding">Timestamp-dependent logic</span>
                      </li>
                    </ul>
                    <div className="report-preview-foot">
                      <span className="mono-wrap">hash 0x9498…b516</span>
                      <span className="report-preview-receipt">Receipt on Base</span>
                    </div>
                  </div>
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
              <div className="section-eyebrow">Workflow</div>
              <h2>How the review flow works</h2>
              <ol className="steps polished-steps">
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Submit a snippet or verified Base contract.</strong> The system
                    normalizes the source and prepares it for the same review pipeline used across the product.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Run static analysis and structural extraction.</strong> This
                    surfaces implementation risks, suspicious patterns, and core contract structure before AI review.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Layer AI-assisted logic review.</strong> The memo highlights
                    behavioral concerns that deserve human verification, not blind trust.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Receive a structured security memo.</strong> Findings are grouped
                    by severity with evidence, remediation direction, and transparency around scope limits.
                  </span>
                </li>
                <li>
                  <span className="how-step-copy">
                    <strong className="how-step-lead">Share or anchor the result when needed.</strong> Owners can
                    manage visibility, create a private link, or mint an optional Base receipt for provenance.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="anchor-section section-zone">
        <div className="zone zone-deep">
          <div className="zone-inner">
            <div className="stack section-card section-card-contrast">
              <div className="section-eyebrow">Capabilities</div>
              <h2>Designed for review quality, not generic dashboard noise</h2>
              <div className="features-grid">
                {capabilities.map((capability) => (
                  <article className="info-block stack" key={capability.title}>
                    <h3>{capability.title}</h3>
                    <p className="muted">{capability.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="anchor-section section-zone">
        <div className="zone zone-faq">
          <div className="zone-inner">
            <div className="stack section-card section-frame">
              <div className="section-eyebrow">Reference</div>
              <h2>FAQ</h2>
              <div className="truth-grid">
                {pinnedTruths.map((item) => (
                  <article className="truth-card stack" key={item.question}>
                    <h3>{item.question}</h3>
                    <p className="muted">{item.answer}</p>
                  </article>
                ))}
              </div>
              <div className="stack faq-list">
                <details className="faq-item">
                  <summary>Who is this for?</summary>
                  <p className="muted">
                    Solidity developers, Base builders, product teams, and users who need a fast review checkpoint.
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
                    It is an optional Base transaction that timestamps a signed report hash.
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
                    You can paste Solidity snippets or submit verified Base contract addresses.
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
              <div className="section-eyebrow">Roadmap</div>
              <h2>Roadmap</h2>
              <div className="roadmap-columns">
                {roadmapGroups.map((group) => (
                  <article className="roadmap-column stack" key={group.title}>
                    <div className="row roadmap-column-head">
                      <span className="badge">{group.title}</span>
                    </div>
                    <div className="roadmap-list" role="list">
                      {group.items.map((item) => (
                        <div className="roadmap-panel" role="listitem" key={item}>
                          <p className="roadmap-description">{item}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
