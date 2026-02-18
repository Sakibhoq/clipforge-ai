// frontend/app/dashboard/page.tsx
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

export default async function DashboardPage({ searchParams }: Props) {
  // Keep /dashboard as a compatibility route, but always land in the app shell.
  // Preserves query params (e.g. next=/app/upload, upload_id=123, etc.)
  try {
    const resolved = await searchParams;
    redirect(`/app${toQueryString(resolved)}`);
  } catch {
    redirect("/app");
  }
}
