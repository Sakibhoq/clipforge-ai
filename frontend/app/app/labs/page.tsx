import { redirect } from "next/navigation";
import { resolveLabsFrontendEntry } from "@/lib/labs-launch";
import { normalizeLabsTarget } from "@/lib/labs-routes";

type SearchParams = Record<string, string | string[] | undefined>;

export default function LabsLaunchRedirectPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  redirect(resolveLabsFrontendEntry(normalizeLabsTarget(searchParams?.target)));
}
