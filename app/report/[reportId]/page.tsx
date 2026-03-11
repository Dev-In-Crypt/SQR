import ReportClient from "@/app/components/ReportClient";

export default async function ReportPage({
  params,
  searchParams
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { reportId } = await params;
  const { token } = await searchParams;

  return (
    <section className="stack page-container">
      <ReportClient reportId={reportId} token={token ?? null} />
    </section>
  );
}
