import AnalysisStatusClient from "@/app/components/AnalysisStatusClient";

export default async function AnalysisPage({
  params
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;

  return (
    <section className="stack page-container">
      <div className="card page-hero-card stack">
        <div className="section-eyebrow">Analysis Pipeline</div>
        <h1>Analysis Status</h1>
        <p className="muted page-intro">
          Follow the review pipeline from source preparation through report generation. Terminal states explain what was
          completed and what to do next.
        </p>
        <p className="page-meta">analysisId: {analysisId}</p>
      </div>
      <AnalysisStatusClient analysisId={analysisId} />
    </section>
  );
}
