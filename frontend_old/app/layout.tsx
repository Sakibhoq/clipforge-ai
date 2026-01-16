import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clipforge — The Creator System",
  description:
    "Upload once. Clipforge keeps your creator pipeline running: generate short-form clips, distribute consistently, and monetize over time.",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "Clipforge — The Creator System",
    description:
      "Upload once. Clipforge keeps your creator pipeline running: generate short-form clips, distribute consistently, and monetize over time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full bg-black">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
