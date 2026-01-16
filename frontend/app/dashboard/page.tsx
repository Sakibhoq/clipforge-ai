// frontend/app/dashboard/page.tsx
import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function DashboardPage({ searchParams }: Props) {
  const params = new URLSearchParams();

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
      else params.set(key, value);
    }
  }

  const qs = params.toString();
  redirect(qs ? `/app?${qs}` : "/app");
}
