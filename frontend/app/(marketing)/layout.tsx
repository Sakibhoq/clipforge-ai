import Navbar from "@/components/Navbar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        relative
        min-h-[100svh]
        overflow-x-hidden
        bg-black
        [padding-left:env(safe-area-inset-left)]
        [padding-right:env(safe-area-inset-right)]
      "
    >
      <Navbar />

      <main
        className="
          relative
          z-0
          [padding-bottom:env(safe-area-inset-bottom)]
        "
      >
        {children}
      </main>
    </div>
  );
}
