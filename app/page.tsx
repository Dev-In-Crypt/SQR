import HomeForm from "@/app/components/HomeForm";

export default function HomePage() {
  return (
    <div className="stack page-stack">
      <section id="analyze" className="stack anchor-section">
        <div className="card stack">
          <h1>Check Solidity code and verified Base contracts in minutes</h1>
          <p className="muted">
            Paste a Solidity snippet or enter a verified Base contract address to get structured findings, AI logic
            review, and a report you can share when needed.
          </p>
        </div>
        <HomeForm />
      </section>

      <section id="how-it-works" className="card stack anchor-section">
        <h2>How it works</h2>
        <ol className="steps">
          <li>Submit Solidity snippets or verified Base contract addresses.</li>
          <li>Static analysis scans known issue patterns.</li>
          <li>AI logic review checks contract behavior and risk signals.</li>
          <li>A report is generated with structured findings and evidence.</li>
          <li>You can optionally mint an onchain receipt.</li>
        </ol>
      </section>

      <section id="features" className="card stack anchor-section">
        <h2>Features</h2>
        <div className="grid-2">
          <div className="stack">
            <strong>Solidity developers</strong>
            <span className="muted">Run fast pre-deployment checks on snippets with structured findings.</span>
          </div>
          <div className="stack">
            <strong>Base builders and teams</strong>
            <span className="muted">Review verified Base contracts before deeper security review.</span>
          </div>
          <div className="stack">
            <strong>Projects and users</strong>
            <span className="muted">Add an extra automated check before integration or deployment decisions.</span>
          </div>
          <div className="stack">
            <strong>Deterministic and shareable output</strong>
            <span className="muted">Use deterministic report hashes, private sharing controls, and optional onchain receipt minting.</span>
          </div>
        </div>
      </section>

      <section id="faq" className="card stack anchor-section">
        <h2>FAQ</h2>
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
      </section>

      <section id="roadmap" className="card stack anchor-section">
        <h2>Roadmap</h2>
        <div className="grid-2">
          <div className="stack">
            <strong>Broader contract input support</strong>
            <span className="muted">Handle more contract layouts and verified source formats with fewer manual steps.</span>
          </div>
          <div className="stack">
            <strong>Richer report explanations</strong>
            <span className="muted">Provide clearer risk context and follow-up guidance next to each finding.</span>
          </div>
          <div className="stack">
            <strong>Improved analysis depth</strong>
            <span className="muted">Expand coverage for complex logic paths and higher-signal risk patterns.</span>
          </div>
          <div className="stack">
            <strong>Saved report workflows</strong>
            <span className="muted">Make it easier to revisit, organize, and track review outputs over time.</span>
          </div>
          <div className="stack">
            <strong>Expanded network support</strong>
            <span className="muted">Extend automated review flows beyond current Base-focused inputs.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
