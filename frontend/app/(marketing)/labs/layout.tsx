import type { Metadata } from "next";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/clipforge-labs-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/clipforge-labs-mark.svg", type: "image/svg+xml" }],
  },
};

export default function LabsMarketingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
