import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

export default function LabsRootRedirectPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const target = firstParam(searchParams?.target).trim().toLowerCase();

  if (target === "clips") {
    redirect("/app/clips?generated=1");
  }

  redirect("/app/generate");
}
