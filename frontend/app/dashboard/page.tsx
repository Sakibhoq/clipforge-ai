// frontend/app/dashboard/page.tsx
import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function toQueryString(searchParams?: Props["searchParams"]) {
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

export default function DashboardPage({ searchParams }: Props) {
  // Keep /dashboard as a compatibility route, but always land in the app shell.
  // Preserves query params (e.g. next=/app/upload, upload_id=123, etc.)
  redirect(`/app${toQueryString(searchParams)}`);
}
