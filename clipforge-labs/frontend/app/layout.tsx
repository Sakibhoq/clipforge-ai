import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/seo";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

// bump when you want browsers to re-fetch the favicon (they can be aggressively cached)
const ICON_V = "cflabs-3";

const fontSans = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: BRAND.metaTitle,
  description: BRAND.metaDescription,
  metadataBase: siteUrl,
  alternates: {
    canonical: "/",
  },

  // App Router: since you have app/icon.tsx, you don't need to manually point to /icon here.
  // Keeping it explicit is fine, but we keep it minimal and correct.
  icons: {
    icon: [{ url: `/icon?v=${ICON_V}`, type: "image/svg+xml" }],
    shortcut: [{ url: `/icon?v=${ICON_V}`, type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // iOS notch safe-area support
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06060b" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <body className="theme-labs bg-system text-white antialiased">{children}</body>
    </html>
  );
}
