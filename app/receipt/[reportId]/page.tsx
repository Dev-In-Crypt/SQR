import ReceiptClient from "@/app/components/ReceiptClient";

export default async function ReceiptPage({
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
      <ReceiptClient reportId={reportId} token={token ?? null} />
    </section>
  );
}
