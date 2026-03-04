import HistoryClient from "@/app/components/HistoryClient";

export default function HistoryPage() {
  return (
    <section className="stack">
      <div className="card">
        <h1>Your Report History</h1>
        <p className="muted">Wallet login required.</p>
      </div>
      <HistoryClient />
    </section>
  );
}
