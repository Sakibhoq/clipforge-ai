import { redirect } from "next/navigation";

const ORBITO_APP_ORIGIN = "https://app.orbito.cc";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

export default function LabsLaunchRedirectPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const target = firstParam(searchParams?.target).trim().toLowerCase();

  if (target === "clips") {
    redirect(`${ORBITO_APP_ORIGIN}/app/labs/app/clips`);
  }

  redirect(`${ORBITO_APP_ORIGIN}/app/labs/app/generate`);
}

