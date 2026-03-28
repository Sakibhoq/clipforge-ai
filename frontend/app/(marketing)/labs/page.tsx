import { redirect } from "next/navigation";
import { labsLaunchPath } from "@/lib/labs-routes";

export default function LabsMarketingPage() {
  redirect(labsLaunchPath("generate"));
}
