import { redirect } from "next/navigation";

export default async function LegacyReportPage({
  params,
  searchParams
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { reportId } = await params;
  const { token } = await searchParams;

  redirect(token ? `/report/${reportId}?token=${encodeURIComponent(token)}` : `/report/${reportId}`);
}
