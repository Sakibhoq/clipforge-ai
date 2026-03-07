import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LabsContactRedirectPage() {
  redirect("https://app.orbito.cc/contact");
}
