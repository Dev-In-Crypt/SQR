import AnalysisStatusClient from "@/app/components/AnalysisStatusClient";

export default async function AnalysisPage({
  params
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;

  return (
    <section className="stack page-container">
      <div className="card">
        <h1>Analysis Status</h1>
        <p className="muted">analysisId: {analysisId}</p>
      </div>
      <AnalysisStatusClient analysisId={analysisId} />
    </section>
  );
}
