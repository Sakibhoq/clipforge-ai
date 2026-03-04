import { redirect } from "next/navigation";

export default function EditorPage() {
  redirect("/app/clips?editor=1");
}
