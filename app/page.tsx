import HomeForm from "@/app/components/HomeForm";

export default function HomePage() {
  return (
    <section className="stack">
      <div className="card stack">
        <h1>Analyze Solidity Snippets or Base Contract Addresses</h1>
        <p className="muted">
          Private by default. Report includes evidence, deterministic hash, and optional Base receipt.
        </p>
      </div>
      <HomeForm />
    </section>
  );
}
