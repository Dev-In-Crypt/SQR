export default function PrivacyPage() {
  return (
    <section className="stack">
      <div className="card stack">
        <h1>Privacy</h1>
        <p className="muted">
          Reports are private by default. Access is limited to owner context unless a report is explicitly published or
          a private share link is generated.
        </p>
        <p className="muted">
          Wallet authentication is used for account-linked actions such as history and ownership controls.
          Operational logs and service telemetry may be retained to maintain reliability and security.
        </p>
      </div>
    </section>
  );
}
