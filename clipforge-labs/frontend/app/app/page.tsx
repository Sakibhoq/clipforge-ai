import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toQueryString(searchParams?: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  if (!searchParams) return "";
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function AppRootPage({ searchParams }: Props) {
  const resolved = await searchParams;
  redirect(`/app/generate${toQueryString(resolved)}`);
}
