import { redirect } from "next/navigation";

/** Reports open in the report center; this keeps old links working. */
export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[key]">) {
  const { key } = await params;
  const sp = await searchParams;
  const p = new URLSearchParams({ r: key });
  for (const k of ["from", "to"]) if (typeof sp[k] === "string") p.set(k, sp[k] as string);
  redirect(`/reports?${p}`);
}
