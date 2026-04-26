import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/seo";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

// bump when you want browsers to re-fetch the favicon (they can be aggressively cached)
const ICON_V = "cflabs-9";
const RAW_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || "").trim();
const BASE_PATH = RAW_BASE_PATH ? `/${RAW_BASE_PATH.replace(/^\/+/, "").replace(/\/+$/, "")}` : "";
const ICON_URL = `${BASE_PATH}/icon?v=${ICON_V}`;

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
    icon: [{ url: ICON_URL, type: "image/svg+xml" }],
    shortcut: [{ url: ICON_URL, type: "image/svg+xml" }],
    apple: [{ url: ICON_URL, type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // iOS notch safe-area support
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#061426" },
    { media: "(prefers-color-scheme: light)", color: "#f4f9ff" },
  ],
};

const themeBootScript = `
(() => {
  try {
    const key = "orbito-theme";
    const stored = window.localStorage.getItem(key);
    const theme = stored === "dark" || stored === "light" ? stored : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${fontSans.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <body className="theme-labs bg-system text-white antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
