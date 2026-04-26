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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className="theme-orbito bg-system text-white antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
