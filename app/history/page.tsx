import HistoryClient from "@/app/components/HistoryClient";

export default function HistoryPage() {
  return (
    <section className="stack page-container">
      <div className="card page-hero-card stack">
        <div className="section-eyebrow">Archive</div>
        <h1>Your Report History</h1>
        <p className="muted page-intro">
          Revisit prior reviews, inspect severity at a glance, and jump back into reports or receipt verification when
          needed.
        </p>
      </div>
      <HistoryClient />
    </section>
  );
}
