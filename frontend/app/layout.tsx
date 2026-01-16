import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clipforge — Creator System",
  description: "Upload once. Your pipeline keeps running.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
