import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import DevNotice from "@/components/DevNotice";

// bump when you want browsers to re-fetch the favicon (they can be aggressively cached)
const ICON_V = "cflabs-2";

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

export const metadata: Metadata = {
  title: BRAND.metaTitle,
  description: BRAND.metaDescription,

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
      <body className="bg-system text-white antialiased">
        <DevNotice />
        {children}
      </body>
    </html>
  );
}
