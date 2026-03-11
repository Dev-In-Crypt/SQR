import HistoryClient from "@/app/components/HistoryClient";

export default function HistoryPage() {
  return (
    <section className="stack page-container">
      <div className="card">
        <h1>Your Report History</h1>
      </div>
      <HistoryClient />
    </section>
  );
}
