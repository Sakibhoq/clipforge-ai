import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";

function metadataBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.CANONICAL_URL ||
    "https://orbito.cc";
  const trimmed = String(raw || "").trim();
  try {
    return new URL(trimmed);
  } catch {
    return new URL("https://orbito.cc");
  }
}

export const metadata: Metadata = {
  title: BRAND.metaTitle,
  description: BRAND.metaDescription,
  metadataBase: metadataBaseUrl(),
  alternates: {
    canonical: "/",
  },

  // App Router: since you have app/icon.tsx, you don't need to manually point to /icon here.
  // Keeping it explicit is fine, but we keep it minimal and correct.
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/icon", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // iOS notch safe-area support
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05040f" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="theme-orbito bg-system text-white antialiased">
        {children}
      </body>
    </html>
  );
}
